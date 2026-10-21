// The engine beneath Skillboard in tests. A World describes the machine (files,
// the session's skill listing, Jev, Haiku, the prompt box); installWorld answers
// every engine call the mod makes from it and records what the mod sent.
import { mock } from 'claude-code/testing'
import type { ContextSkill, On } from 'claude-code'

export type FsNode = string | { link: string }

export type JevBody = {
  model: string
  state: string
  questions: Record<string, { type: string; instructions: string; criteria: Record<string, string> }>
}

export type JevReply = { status: number; json: unknown } | 'network-error'

export type World = {
  home?: string
  cwd?: string
  /** Absolute path to file text or symlink. Directories are implied by the paths below them. */
  files?: Record<string, FsNode>
  mtimes?: Record<string, number>
  /** The session's skill listing; null means the breakdown is not ready yet. */
  usage?: readonly ContextSkill[] | null
  enabledPlugins?: Record<string, boolean>
  settingsLanguage?: string
  env?: { LANG?: string; LC_ALL?: string }
  store?: Record<string, unknown>
  jev?: (body: JevBody) => JevReply
  haiku?: (prompt: string, system: string) => string | 'api-error'
  draft?: string
  fillRefusal?: 'no_composer' | 'dialog'
  clipboard?: 'ok' | 'no-clipboard'
}

export type Recorder = {
  jevBodies: JevBody[]
  jevHeaders: Record<string, string>[]
  haikuPrompts: string[]
  fills: string[]
  copies: string[]
  toasts: string[]
  writes: { path: string; text: string }[]
  scrolls: unknown[]
  commands: string[]
  opened: string[]
  closed: string[]
  files: Record<string, FsNode>
  /** The prompt box as the mod left it. */
  draft: () => string
  /** Lets work the mod started without awaiting run to its end. */
  settle: () => Promise<void>
  /** Changes the session's skill listing, as installing a plugin mid-session does. */
  setUsage: (usage: readonly ContextSkill[] | null) => void
}

export const HOME = '/h'
export const CWD = '/p'

export function installWorld(on: On, world: World): Recorder {
  const home = world.home ?? HOME
  const files: Record<string, FsNode> = { ...(world.files ?? {}) }
  const mtimes: Record<string, number> = { ...(world.mtimes ?? {}) }
  let usage = world.usage === undefined ? [] : world.usage
  let draft = world.draft ?? ''
  const shown = new Set<string>()
  const clock = mock.clock(on)
  mock.store(on, world.store ?? {})
  mock.env(on, { HOME: home, ...(world.env ?? {}) })

  const rec: Recorder = {
    jevBodies: [], jevHeaders: [], haikuPrompts: [], fills: [], copies: [], toasts: [], writes: [], scrolls: [],
    commands: [], opened: [], closed: [], files,
    draft: () => draft,
    settle: () => clock.settle(),
    setUsage: next => { usage = next },
  }

  const resolve = (path: string): string => {
    let at = ''
    for (const part of path.split('/').filter(Boolean)) {
      at = `${at}/${part}`
      const node = files[at]
      if (node !== undefined && typeof node !== 'string') at = node.link
    }
    return at || '/'
  }
  const isDir = (path: string) => Object.keys(files).some(p => resolve(p).startsWith(`${path}/`) || p.startsWith(`${path}/`))
  const kindOf = (path: string): 'file' | 'dir' | null => {
    const real = resolve(path)
    if (typeof files[real] === 'string') return 'file'
    return isDir(real) ? 'dir' : null
  }

  on('fs.read', (_, e) => {
    const node = files[resolve(e.path)]
    return typeof node === 'string' ? { value: node } : { deny: `ENOENT: ${e.path}` }
  })
  on('fs.exists', (_, e) => ({ value: kindOf(e.path) !== null }))
  on('fs.stat', (_, e) => {
    const kind = kindOf(e.path)
    if (kind === null) return { deny: `ENOENT: ${e.path}` }
    const isLink = typeof files[e.path] === 'object'
    return {
      value: {
        kind, size: 0, mtimeMs: mtimes[e.path] ?? 0, isLink,
        ...(e.resolve ? { realPath: resolve(e.path) } : {}),
      },
    }
  })
  on('fs.list', (_, e) => {
    const dir = resolve(e.path)
    if (kindOf(dir) !== 'dir') return { deny: `ENOENT: ${e.path}` }
    const names = new Set<string>()
    for (const p of Object.keys(files)) if (p.startsWith(`${dir}/`)) names.add(p.slice(dir.length + 1).split('/')[0]!)
    return {
      value: [...names].sort().map(name => {
        const path = `${dir}/${name}`
        const node = files[path]
        const kind = typeof node === 'object' ? ('other' as const) : typeof node === 'string' ? ('file' as const) : ('dir' as const)
        return { name, kind, size: 0, mtimeMs: mtimes[path] ?? 0, isLink: typeof node === 'object' }
      }),
    }
  })
  on('fs.write', (_, e) => {
    files[e.path] = e.text
    mtimes[e.path] = (mtimes[e.path] ?? 0) + 1
    rec.writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })

  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      rateLimits: [],
      context: {
        window: 200000,
        ...(usage === null
          ? {}
          : { breakdown: { skills: { totalSkills: usage.length, includedSkills: usage.length, tokens: 0, skillFrontmatter: [...usage] } } }),
      },
    } as never,
  }))
  on('settings.read', () => ({
    value: {
      ...(world.settingsLanguage === undefined ? {} : { language: world.settingsLanguage }),
      ...(world.enabledPlugins === undefined ? {} : { enabledPlugins: world.enabledPlugins }),
    },
  }))
  on('command.register', (_, e) => {
    rec.commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  on('prompt.fill', (_, e) => {
    if (world.fillRefusal) return { isFilled: false, refusal: world.fillRefusal }
    draft = e.text
    rec.fills.push(e.text)
    return { isFilled: true }
  })
  on('ui.copy', (_, e) => {
    if (world.clipboard === 'no-clipboard') return { value: { isCopied: false, reason: 'no-clipboard' } }
    rec.copies.push(e.text)
    return { value: { isCopied: true } }
  })
  on('ui.toast', (_, e) => {
    rec.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.open', (_, e) => {
    shown.add(e.id)
    rec.opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    shown.delete(e.id)
    rec.closed.push(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...shown].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.scroll', (_, e) => {
    rec.scrolls.push(e)
    return {}
  })
  on('http.fetch', (_, e) => {
    const body = JSON.parse(e.init?.body ?? '{}') as JevBody
    rec.jevBodies.push(body)
    rec.jevHeaders.push(e.init?.headers ?? {})
    if (!world.jev) throw new Error(`unexpected fetch of ${e.url}`)
    const reply = world.jev(body)
    if (reply === 'network-error') return { deny: 'network error' }
    return { value: { status: reply.status, ok: reply.status < 400, headers: {}, text: JSON.stringify(reply.json) } }
  })
  on('model.complete', (_, e) => {
    rec.haikuPrompts.push(e.prompt)
    if (!world.haiku) throw new Error('unexpected model.complete')
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    const text = world.haiku(e.prompt, e.system ?? '')
    if (text === 'api-error') {
      return { value: { isAnswered: false, reason: 'api-error', status: 500, error: 'api_error', usage } as never }
    }
    return { value: { isAnswered: true, text, usage } }
  })
  return rec
}

/** Answers Jev from a scoring function over each question's criteria. */
export function jevScoring(score: (criterion: string) => number) {
  return (body: JevBody): JevReply => ({
    status: 200,
    json: {
      answers: Object.fromEntries(
        Object.entries(body.questions).map(([id, q]) => {
          const raw = Object.entries(q.criteria).map(([label, text]) => [label, score(text)] as const)
          const sum = raw.reduce((s, [, p]) => s + p, 0) || 1
          const probabilities = Object.fromEntries(raw.map(([label, p]) => [label, p / sum]))
          return [id, { choice: raw[0]?.[0], confidence: 1, probabilities }]
        }),
      ),
    },
  })
}

export const PANE = { plugin: 'skillboard', component: 'Pane', requestId: 'skillboard' } as const

export const paneProps = (placement: 'dock' | 'inline', bodyRows = 40) => ({
  title: 'Skills', isFocused: false, bodyColumns: 60, placement, scroll: { offset: 0, bodyRows }, view: {},
})

export const SURFACES = ['terminal', 'desktop', 'mobile'] as const

export const skillMd = (description: string) => `---\nname: x\ndescription: ${description}\n---\n\nBody.\n`

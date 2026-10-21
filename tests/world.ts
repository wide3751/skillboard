// The engine beneath Skillboard in tests. A World describes the machine (files,
// the session's skill listing, Jev, Haiku, the prompt box); installWorld answers
// every engine call the mod makes from it and records what the mod sent.
import { mock } from 'claude-code/testing'
import type { CommandInfo, ContextSkill, On } from 'claude-code'

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
  /** The slash commands besides the ones the mod registers itself. */
  commands?: readonly CommandInfo[]
  enabledPlugins?: Record<string, boolean>
  settingsLanguage?: string
  env?: { LANG?: string; LC_ALL?: string }
  /** macOS's preferred languages, first first; absent, `defaults` is not there to run. */
  appleLanguages?: readonly string[]
  store?: Record<string, unknown>
  jev?: (body: JevBody, call: number) => JevReply | Promise<JevReply>
  /** May wait on `sleep`, so a test can hold calls in flight until it advances the clock. */
  haiku?: (prompt: string, system: string) => string | Promise<string>
  draft?: string
  fillRefusal?: 'no_composer' | 'dialog'
  clipboard?: 'ok' | 'no-clipboard'
}

export type Recorder = {
  jevBodies: JevBody[]
  jevHeaders: Record<string, string>[]
  jevUrls: string[]
  haikuPrompts: string[]
  fills: string[]
  copies: string[]
  toasts: string[]
  writes: { path: string; text: string }[]
  commands: string[]
  opened: string[]
  closed: string[]
  files: Record<string, FsNode>
  /** The mod's `$.store` as it left it: what the next session starts from. */
  store: Record<string, unknown>
  /** The prompt box as the mod left it. */
  draft: () => string
  /** A person editing a file by hand. */
  edit: (path: string, text: string) => void
  /** The person typing into the prompt box. */
  setDraft: (text: string) => void
  /** Lets work the mod started without awaiting run to its end. */
  settle: () => Promise<void>
  /** Moves the mocked clock, releasing stand-ins waiting on `sleep`. */
  advance: (ms: number) => Promise<void>
  sleep: (ms: number) => Promise<void>
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
  const store: Record<string, unknown> = { ...(world.store ?? {}) }
  const clock = mock.clock(on)
  mock.env(on, { HOME: home, ...(world.env ?? {}) })

  const rec: Recorder = {
    jevBodies: [], jevHeaders: [], jevUrls: [], haikuPrompts: [], fills: [], copies: [], toasts: [], writes: [],
    commands: [], opened: [], closed: [], files, store,
    draft: () => draft,
    setDraft: text => { draft = text },
    edit: (path, text) => {
      files[path] = text
      mtimes[path] = (mtimes[path] ?? 0) + 100
    },
    settle: () => clock.settle(),
    advance: ms => clock.advance(ms),
    sleep: ms => clock.sleep(ms),
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

  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    delete store[e.key]
    return { value: undefined }
  })
  on('store.keys', () => ({ value: Object.keys(store) }))
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
  on('process.run', (_, e) => {
    if (world.appleLanguages === undefined || e.argv.join(' ') !== 'defaults read -g AppleLanguages') {
      return { deny: `cannot run ${e.argv[0]}` }
    }
    const stdout = `(\n${world.appleLanguages.map(l => `    "${l}"`).join(',\n')}\n)\n`
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.list', () => ({
    value: [
      ...(world.commands ?? []),
      ...rec.commands.map(name => ({ name, description: '', source: 'plugin' as const, plugin: 'skillboard' })),
    ],
  }))
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
  on('ui.scroll', () => ({}))
  on('http.fetch', async (_, e) => {
    const body = JSON.parse(e.init?.body ?? '{}') as JevBody
    rec.jevBodies.push(body)
    rec.jevUrls.push(e.url)
    rec.jevHeaders.push(e.init?.headers ?? {})
    if (!world.jev) throw new Error(`unexpected fetch of ${e.url}`)
    const reply = await world.jev(body, rec.jevBodies.length)
    if (reply === 'network-error') return { deny: 'network error' }
    return { value: { status: reply.status, ok: reply.status < 400, headers: {}, text: JSON.stringify(reply.json) } }
  })
  on('model.complete', async (_, e) => {
    rec.haikuPrompts.push(e.prompt)
    if (!world.haiku) throw new Error('unexpected model.complete')
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    const text = await world.haiku(e.prompt, e.system ?? '')
    if (text === 'api-error') {
      return { value: { isAnswered: false, reason: 'api-error', status: 500, error: 'api_error', usage } as never }
    }
    return { value: { isAnswered: true, text, usage } }
  })
  return rec
}

/** Answers every question of a Jev request with the probability `score` gives each criterion's text. */
export function jevAnswer(score: (criterion: string) => number) {
  return (body: JevBody): JevReply => ({
    status: 200,
    json: {
      answers: Object.fromEntries(
        Object.entries(body.questions).map(([id, q]) => {
          const probabilities = Object.fromEntries(Object.entries(q.criteria).map(([label, text]) => [label, score(text)]))
          return [id, { choice: Object.keys(probabilities)[0], confidence: 1, probabilities }]
        }),
      ),
    },
  })
}

/** The probability a stand-in gives a skill, by the name its criterion starts with. */
export const byName = (probabilities: Record<string, number>) => (criterion: string) =>
  probabilities[criterion.split(':')[0]!] ?? 0

export const PANE = { plugin: 'skillboard', component: 'Pane', requestId: 'skillboard' } as const

export const paneProps = (placement: 'dock' | 'inline', bodyRows = 40) => ({
  title: 'Skills', isFocused: false, bodyColumns: 60, placement, scroll: { offset: 0, bodyRows }, view: {},
})

export const SURFACES = ['terminal', 'desktop', 'mobile'] as const

export const skillMd = (description: string) => `---\nname: x\ndescription: ${description}\n---\n\nBody.\n`

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] } | string | null | undefined

/** The drawing as lines of text, roughly as a terminal shows it: a row Box joins its parts on one line. */
export async function screen(ui: { drawn: () => Promise<unknown> }): Promise<string> {
  const inline = (node: Node): string => {
    if (node === null || node === undefined) return ''
    if (typeof node === 'string') return node
    return (node.children ?? []).map(child => inline(child as Node)).join('')
  }
  const lines = (node: Node): string[] => {
    if (node === null || node === undefined) return []
    if (typeof node === 'string') return [node]
    const children = (node.children ?? []) as Node[]
    switch (node.type) {
      case 'Text': return [inline(node)]
      case 'Button': return [children.length > 0 ? inline(node) : String(node.props?.label ?? '')]
      case 'Input': return [`[? ${String(node.props?.value || node.props?.placeholder || '')}]`]
      case 'Select': return [`<${String(node.props?.value ?? '')}>`]
      default: {
        const parts = children.flatMap(lines)
        return node.props?.flexDirection === 'row' ? [parts.join(' ')] : parts
      }
    }
  }
  return lines((await ui.drawn()) as Node).join('\n')
}

/** A prompt as the person submits it at the composer. */
export const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' as const } })

/** A small machine: one plugin from two marketplaces, an older user-level copy of tdd, and a project skill. */
export const SMALL: World = {
  files: {
    [`${HOME}/.claude/plugins/installed_plugins.json`]: JSON.stringify({
      version: 2,
      plugins: {
        'mattpocock-skills@mattpocock': [{ scope: 'user', installPath: '/cache/mp/1.3.1', version: '1.3.1' }],
      },
    }),
    '/cache/mp/1.3.1/skills/tdd/SKILL.md': skillMd('Test-driven development'),
    '/cache/mp/1.3.1/skills/grilling/SKILL.md': skillMd('Grill the user about a plan'),
    '/cache/mp/1.3.1/skills/diagnose/SKILL.md': skillMd('Diagnose hard bugs'),
    [`${HOME}/.claude/skills/tdd`]: { link: '/git/mp/skills/tdd' },
    '/git/mp/skills/tdd/SKILL.md': skillMd('Old TDD'),
    '/git/mp/.claude-plugin/plugin.json': JSON.stringify({ version: '1.2.0' }),
    [`${CWD}/.claude/skills/deploy/SKILL.md`]: skillMd('Deploys this project'),
  },
  usage: [
    { name: 'mattpocock-skills:tdd', source: 'plugin', pluginName: 'mattpocock-skills', tokens: 1 },
    { name: 'mattpocock-skills:grilling', source: 'plugin', pluginName: 'mattpocock-skills', tokens: 1 },
    { name: 'mattpocock-skills:diagnose', source: 'plugin', pluginName: 'mattpocock-skills', tokens: 1 },
    { name: 'tdd', source: 'userSettings', tokens: 1 },
    { name: 'deploy', source: 'projectSettings', tokens: 1 },
  ],
}

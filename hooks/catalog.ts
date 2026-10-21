import { atom, read, update } from 'claude-code'
import type { CommandInfo, ContextSkill, EngineInterface } from 'claude-code'
import type { PluginInstall, SkillCatalog, SkillEntry, SkillId, Source, SourceGroup, SourceId, Version } from '../types'

const catalog = atom({ plugin: 'skillboard', key: 'catalog' } as const, { status: 'pending' } as SkillCatalog)

export function readCatalog($: EngineInterface): Promise<SkillCatalog> {
  return read($, catalog)
}

export type ScanRoots = { cwd: string; home: string }

/**
 * Brings the catalog up to date with the session's skill listing. Membership is
 * the model's listing plus the slash commands that turn out to be skills: a
 * skill with `disable-model-invocation` is missing from the model's listing but
 * still typed as `/name`. One row per name; the filesystem supplies
 * descriptions and versions. An unchanged fingerprint reads no SKILL.md unless
 * `force`. A listing that is not ready leaves the atom as it was.
 */
export async function refreshCatalog($: EngineInterface, roots: ScanRoots, force: boolean): Promise<SkillCatalog> {
  const usage = await $.session.usage({ breakdown: 'summary' })
  const listed = usage.context.breakdown?.skills?.skillFrontmatter
  if (!listed) return read($, catalog)
  const commands = await attempt(() => $.command.list(), [] as CommandInfo[])

  const installedPath = `${roots.home}/.claude/plugins/installed_plugins.json`
  const [installedText, installedStat, enabled, userDir, projectDir] = await Promise.all([
    attempt(() => readText($, installedPath), ''),
    attempt(() => $.fs.stat(installedPath), null),
    enabledPlugins($),
    attempt(() => $.fs.list(`${roots.home}/.claude/skills`), []),
    attempt(() => $.fs.list(`${roots.cwd}/.claude/skills`), []),
  ])
  const fingerprint = JSON.stringify([
    roots,
    listed.map(s => `${s.source}|${s.pluginName ?? ''}|${s.name}`).sort(),
    commands.map(c => `${c.source}|${c.plugin ?? ''}|${c.name}`).sort(),
    installedStat?.mtimeMs ?? null,
    enabled ?? null,
    userDir.map(d => [d.name, d.mtimeMs]),
    projectDir.map(d => [d.name, d.mtimeMs]),
  ])
  const previous = await read($, catalog)
  if (!force && previous.status === 'ready' && previous.fingerprint === fingerprint) return previous

  const installs = parseInstalledPlugins(installedText, roots.cwd, enabled)
  const skillDirs = new Map<string, Promise<string[]>>()
  const listedNames = new Set(listed.map(s => s.name))
  const typedOnly = commands.filter(c => !listedNames.has(c.name)).map(skillOfCommand).filter(s => s !== null)
  const rows = await Promise.all([
    ...listed.map(skill => scanSkill($, skill, installs, skillDirs, roots)),
    ...typedOnly.map(skill => scanSkill($, skill, installs, skillDirs, roots, { requireFile: true })),
  ])
  const next: SkillCatalog = { status: 'ready', fingerprint, groups: groupRows(rows.filter(r => r !== null)) }
  await update($, catalog, () => next)
  return next
}

/** Read off the merged settings object: the per-key read is a projection a test engine need not apply. */
async function enabledPlugins($: EngineInterface): Promise<unknown> {
  const settings = await $.settings.read()
  return settings.enabledPlugins
}

type Row = { source: Source; entry: SkillEntry }

type Candidate = Pick<ContextSkill, 'name' | 'source' | 'pluginName'>

/**
 * A slash command as the skill it may be: a plugin's `<plugin>:<x>` or a bare
 * user or project name. The scan decides whether a SKILL.md stands behind it,
 * and for a bare name whether that file is the user's or the project's.
 */
function skillOfCommand(command: CommandInfo): Candidate | null {
  if (command.source === 'plugin') {
    const plugin = command.plugin ?? command.name.split(':')[0]!
    return command.name.startsWith(`${plugin}:`) ? { name: command.name, source: 'plugin', pluginName: plugin } : null
  }
  if (command.source === 'user' && !command.name.includes(':')) return { name: command.name, source: 'userSettings' }
  return null
}

/** With `requireFile`, a candidate no SKILL.md stands behind is a command and scans to null. */
async function scanSkill(
  $: EngineInterface,
  skill: Candidate,
  installs: ReadonlyMap<string, PluginInstall[]>,
  skillDirs: Map<string, Promise<string[]>>,
  roots: ScanRoots,
  { requireFile = false } = {},
): Promise<Row | null> {
  if (skill.source === 'plugin' && skill.pluginName) {
    const plugin = skill.pluginName
    const baseName = skill.name.startsWith(`${plugin}:`) ? skill.name.slice(plugin.length + 1) : skill.name
    const all = installs.get(plugin) ?? []
    const located = await Promise.all(all.map(async install => ({ install, path: await locatePluginSkill($, install, baseName, skillDirs) })))
    const shipping = located.filter(l => l.path !== null)
    if (requireFile && shipping.length === 0) return null
    const first = shipping[0]
    const description = first?.path ? parseDescription(await attempt(() => readText($, first.path!), '')) : ''
    const source: Source = { kind: 'plugin', id: sourceIdOf('plugin', plugin), plugin, installs: all }
    const versions = (shipping.length > 0 ? shipping.map(l => l.install) : all).map(i => i.version)
    return {
      source,
      entry: entryOf(source.id, skill.name, baseName, newest(versions), shipping.map(l => l.install.marketplace), description),
    }
  }
  if (skill.source === 'userSettings' || skill.source === 'projectSettings') {
    const userDir = `${roots.home}/.claude/skills/${skill.name}`
    const projectDir = `${roots.cwd}/.claude/skills/${skill.name}`
    let kind: 'user' | 'project' = skill.source === 'userSettings' ? 'user' : 'project'
    if (requireFile) {
      if (await $.fs.exists(`${userDir}/SKILL.md`)) kind = 'user'
      else if (await $.fs.exists(`${projectDir}/SKILL.md`)) kind = 'project'
      else return null
    }
    const dir = kind === 'user' ? userDir : projectDir
    const [text, version] = await Promise.all([
      attempt(() => readText($, `${dir}/SKILL.md`), ''),
      deriveVersion($, dir, roots.home),
    ])
    const source: Source = { kind, id: sourceIdOf(kind) }
    return { source, entry: entryOf(source.id, skill.name, skill.name, version, [], parseDescription(text)) }
  }
  const source: Source =
    skill.source === 'built-in'
      ? { kind: 'builtin', id: sourceIdOf('builtin') }
      : { kind: 'other', id: sourceIdOf('other', skill.source), engineWord: skill.source }
  return { source, entry: entryOf(source.id, skill.name, skill.name, UNKNOWN, [], '') }
}

const UNKNOWN: Version = { kind: 'unknown', updatedAtMs: null }

function sourceIdOf(kind: Source['kind'], detail?: string): SourceId {
  return (detail === undefined ? kind : `${kind}:${detail}`) as SourceId
}

function entryOf(
  sourceId: SourceId, name: string, baseName: string, version: Version, marketplaces: readonly string[], description: string,
): SkillEntry {
  return {
    id: `${sourceId}|${name}` as SkillId, name, baseName, sourceId, version, marketplaces, description,
    descriptionHash: hashText(description),
  }
}

async function locatePluginSkill(
  $: EngineInterface, install: PluginInstall, baseName: string, skillDirs: Map<string, Promise<string[]>>,
): Promise<string | null> {
  let dirs = skillDirs.get(install.installPath)
  if (!dirs) {
    dirs = pluginSkillDirs($, install.installPath)
    skillDirs.set(install.installPath, dirs)
  }
  for (const dir of await dirs) {
    const candidates = [`${dir}/${baseName}/SKILL.md`]
    if (dir.endsWith(`/${baseName}`)) candidates.push(`${dir}/SKILL.md`)
    for (const path of candidates) if (await $.fs.exists(path)) return path
  }
  return null
}

/** The manifest's `skills` paths when it names any, else the default `skills/` folder. */
async function pluginSkillDirs($: EngineInterface, installPath: string): Promise<string[]> {
  const manifest = await attempt(async () => JSON.parse(await readText($, `${installPath}/.claude-plugin/plugin.json`)) as unknown, null)
  const named = isRecord(manifest) ? manifest.skills : undefined
  const paths = typeof named === 'string' ? [named] : Array.isArray(named) ? named.filter(p => typeof p === 'string') : []
  return (paths.length > 0 ? paths : ['./skills']).map(p => joinPath(installPath, p))
}

/** Follows the skill folder's links to its real path, then walks up to the nearest plugin manifest. */
async function deriveVersion($: EngineInterface, dir: string, home: string): Promise<Version> {
  const stat = await attempt(() => $.fs.stat(dir, { resolve: true }), null)
  let at = stat?.realPath ?? dir
  while (at !== '/' && at !== '' && at !== home) {
    const manifest = `${at}/.claude-plugin/plugin.json`
    if (await $.fs.exists(manifest)) {
      const json = await attempt(async () => JSON.parse(await readText($, manifest)) as unknown, null)
      return parseVersion(isRecord(json) ? json.version : undefined, stat?.mtimeMs ?? null)
    }
    at = at.slice(0, at.lastIndexOf('/'))
  }
  return { kind: 'unknown', updatedAtMs: stat?.mtimeMs ?? null }
}

/**
 * installed_plugins.json v2 to the enabled installs per plugin name. An install
 * applies when its scope is user or its projectPath holds `cwd`; of several
 * applicable records for one install, the most local scope wins.
 */
function parseInstalledPlugins(text: string, cwd: string, enabled: unknown): Map<string, PluginInstall[]> {
  const byName = new Map<string, PluginInstall[]>()
  const data = attemptSync(() => JSON.parse(text) as unknown, null)
  const plugins = isRecord(data) && isRecord(data.plugins) ? data.plugins : {}
  for (const [key, records] of Object.entries(plugins)) {
    const at = key.lastIndexOf('@')
    if (at <= 0 || !Array.isArray(records)) continue
    if (isRecord(enabled) && enabled[key] !== true) continue
    const applicable = records.filter(isRecord).filter(r => {
      if (r.scope === 'user' || r.scope === undefined) return true
      return typeof r.projectPath === 'string' && (cwd === r.projectPath || cwd.startsWith(`${r.projectPath}/`))
    })
    const rank = (scope: unknown) => (scope === 'local' ? 0 : scope === 'project' ? 1 : 2)
    const record = applicable.sort((a, b) => rank(a.scope) - rank(b.scope))[0]
    if (!record || typeof record.installPath !== 'string') continue
    const name = key.slice(0, at)
    const updatedAtMs = typeof record.lastUpdated === 'string' ? Date.parse(record.lastUpdated) || null : null
    const list = byName.get(name) ?? []
    list.push({ marketplace: key.slice(at + 1), installPath: record.installPath, version: parseVersion(record.version, updatedAtMs) })
    byName.set(name, list)
  }
  return byName
}

export function parseVersion(text: unknown, updatedAtMs: number | null): Version {
  if (typeof text !== 'string') return { kind: 'unknown', updatedAtMs }
  const semver = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(text.trim())
  if (semver) {
    const parts = [Number(semver[1]), Number(semver[2]), Number(semver[3])] as const
    return { kind: 'semver', text: text.trim().replace(/^v/, ''), parts, pre: semver[4] ?? null }
  }
  if (/^[0-9a-f]{7,40}$/i.test(text.trim())) return { kind: 'sha', text: text.trim(), updatedAtMs }
  return { kind: 'unknown', updatedAtMs }
}

/** Positive when `a` is newer: semver beats a SHA or an unknown; those compare by update time. */
export function compareVersions(a: Version, b: Version): number {
  if (a.kind === 'semver' && b.kind === 'semver') {
    for (let i = 0; i < 3; i++) if (a.parts[i] !== b.parts[i]) return a.parts[i]! - b.parts[i]!
    if (a.pre === b.pre) return 0
    if (a.pre === null) return 1
    if (b.pre === null) return -1
    return a.pre < b.pre ? -1 : 1
  }
  if (a.kind === 'semver') return 1
  if (b.kind === 'semver') return -1
  return (a.updatedAtMs ?? -Infinity) - (b.updatedAtMs ?? -Infinity) || 0
}

export function newest(versions: readonly Version[]): Version {
  return versions.reduce<Version>((best, v) => (compareVersions(v, best) > 0 ? v : best), versions[0] ?? UNKNOWN)
}

export function formatVersion(version: Version): string {
  if (version.kind === 'semver') return version.text
  if (version.kind === 'sha') return version.text.slice(0, 7)
  return '—'
}

/** The frontmatter `description`: plain, quoted, or a `>` / `|` block. */
export function parseDescription(markdown: string): string {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)
  if (!front) return ''
  const lines = front[1]!.split(/\r?\n/)
  const at = lines.findIndex(line => /^description:/.test(line))
  if (at < 0) return ''
  const head = lines[at]!.slice('description:'.length).trim()
  const following: string[] = []
  for (const line of lines.slice(at + 1)) {
    if (line.trim() !== '' && !/^\s/.test(line)) break
    following.push(line.trim())
  }
  if (/^[>|][-+]?$/.test(head)) {
    return (head.startsWith('|') ? following.join('\n') : following.join(' ').replace(/ {2,}/g, ' ')).trim()
  }
  const text = [head, ...following].filter(Boolean).join(' ')
  if (text.startsWith('"') && text.endsWith('"')) return attemptSync(() => JSON.parse(text) as string, text.slice(1, -1))
  if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replace(/''/g, "'")
  return text
}

/** FNV-1a over the whitespace-normalised text: what a Translation File records to spot a changed original. */
export function hashText(text: string): string {
  let hash = 0x811c9dc5
  for (const char of text.replace(/\s+/g, ' ').trim()) {
    hash ^= char.codePointAt(0)!
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

const SOURCE_ORDER: Record<Source['kind'], number> = { plugin: 0, user: 1, project: 2, builtin: 3, other: 4 }

function groupRows(rows: readonly Row[]): SourceGroup[] {
  const groups = new Map<SourceId, { source: Source; skills: SkillEntry[] }>()
  for (const { source, entry } of rows) {
    const group = groups.get(source.id) ?? { source, skills: [] }
    if (!group.skills.some(s => s.id === entry.id)) group.skills.push(entry)
    groups.set(source.id, group)
  }
  const label = (s: Source) => (s.kind === 'plugin' ? s.plugin : s.id)
  return [...groups.values()]
    .sort((a, b) => SOURCE_ORDER[a.source.kind] - SOURCE_ORDER[b.source.kind] || label(a.source).localeCompare(label(b.source)))
    .map(g => ({ source: g.source, skills: g.skills.sort((a, b) => a.baseName.localeCompare(b.baseName) || a.name.localeCompare(b.name)) }))
}

function joinPath(root: string, relative: string): string {
  if (relative.startsWith('/')) return relative
  const parts = root.split('/')
  for (const part of relative.split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '.' && part !== '') parts.push(part)
  }
  return parts.join('/')
}

async function readText($: EngineInterface, path: string): Promise<string> {
  return (await $.fs.read(path)) as string
}

async function attempt<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run()
  } catch {
    return fallback
  }
}

function attemptSync<T>(run: () => T, fallback: T): T {
  try {
    return run()
  } catch {
    return fallback
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

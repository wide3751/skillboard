// What the Skills Pane shows, decided in one pure function from the atoms'
// values. paint.tsx only maps the result onto a surface's elements.
import { formatVersion, newest } from './catalog'
import { t, type Say } from './i18n'
import { translationKeyOf } from './translate'
import type {
  BrowseState, Intent, JevFailure, Lang, RecommendationPick, RecommendationState, SkillCatalog, SkillEntry, SkillId, Source,
  SourceGroup, TranslationsState,
} from '../types'

export const PANE_ID = 'skillboard'
export const INLINE_WINDOW_ROWS = 6
export const LANG_SELECT_KEY = 'lang'

/** The one source of element keys: tests press these strings too. */
export function keyOf(intent: Intent): string {
  switch (intent.kind) {
    case 'search': return 'search'
    case 'toggleGroup': return `group:${intent.sourceId}`
    case 'toggleSkill': return `skill:${intent.skillId}`
    case 'toggleOriginal': return `original:${intent.skillId}`
    case 'reveal': return `rec:${intent.skillId}`
    case 'toggleAll': return 'all'
    case 'scroll': return intent.delta < 0 ? 'up' : 'down'
    case 'refresh': return 'refresh'
    case 'rerun': return 'rerun'
    case 'translate': return `translate:${intent.skillId}`
    case 'fill': return `fill:${intent.skillId}`
    case 'setLang': return `lang:${intent.lang}`
    case 'hide': return `hide:${intent.skillId}`
    case 'unhide': return `unhide:${intent.skillId}`
    case 'toggleShowHidden': return 'showHidden'
  }
}

export type Action = { key: string; intent: Intent; label: string }

const act = (intent: Intent, label: string): Action => ({ key: keyOf(intent), intent, label })

export type PaneModel = {
  layout: 'dock' | 'inline'
  /** null when no Jev key is set: the section is absent, not empty. */
  recommendation: RecommendationModel | null
  toolbar: {
    search: { key: string; value: string; placeholder: string }
    /** Dock only: inline keeps just the Recommendation, search and 全部. */
    refresh: Action | null
    /** Inline only: shows or hides the catalog window. */
    all: Action | null
    language: { label: string; value: Lang; options: readonly { lang: Lang; label: string; action: Action }[] } | null
  }
  catalog: CatalogModel
  /** Below the catalog while it is drawn and some listed skill is hidden. */
  showHidden: Action | null
}

export type RecommendationModel = {
  heading: string
  /** Dim before any prompt was submitted: it then runs on the draft, and an empty draft does nothing. */
  rerun: Action & { isDim: boolean }
  body:
    | { kind: 'idle' }
    | { kind: 'running'; text: string; picks: readonly PickModel[] }
    | { kind: 'picks'; picks: readonly PickModel[] }
    | { kind: 'message'; text: string }
}

export type PickModel = Action & { name: string; percent: string; detail: string }

export type CatalogModel =
  | { kind: 'hidden' }
  | { kind: 'message'; text: string }
  | { kind: 'groups'; groups: readonly GroupModel[] }
  | { kind: 'window'; rows: readonly (GroupModel | SkillModel)[]; up: Action | null; down: Action | null }

export type GroupModel = Action & {
  row: 'group'
  title: string
  version: string | null
  count: string
  isOpen: boolean
  skills: readonly SkillModel[]
}

export type SkillModel = Action & {
  row: 'skill'
  name: string
  /** The description's first sentence, cut to one line; null when expanded, inline, or with no description. */
  summary: string | null
  isHidden: boolean
  isExpanded: boolean
  detail: DetailModel | null
}

export type DetailModel = {
  meta: string
  text: string
  badge: string | null
  status: string | null
  alsoIn: string | null
  translate: Action | null
  toggleOriginal: Action | null
  fill: Action
  /** 隱藏, or 取消隱藏 on a hidden skill. */
  hide: Action
}

export type Snapshot = {
  catalog: SkillCatalog
  recommendation: RecommendationState
  translations: TranslationsState
  browse: BrowseState
  hidden: readonly SkillId[]
  lang: Lang
}

export type ProjectOptions = { hasJev: boolean; threshold: number; columns: number }

const LANG_NAMES: Record<Lang, string> = { 'zh-TW': '繁體中文', en: 'English', ja: '日本語', 'zh-CN': '简体中文' }
const LANGS = Object.keys(LANG_NAMES) as Lang[]

export function project(s: Snapshot, placement: 'dock' | 'inline', options: ProjectOptions): PaneModel {
  const say = t(s.lang)
  const translations = s.translations.lang === s.lang ? s.translations : null
  const catalog = projectCatalog(s, translations, placement, options.columns, say)
  return {
    layout: placement,
    recommendation: options.hasJev ? projectRecommendation(s, options.threshold, say) : null,
    toolbar: {
      search: { key: keyOf({ kind: 'search', query: '' }), value: s.browse.query, placeholder: say('search') },
      refresh: placement === 'dock' ? act({ kind: 'refresh' }, say('refresh')) : null,
      all: placement === 'inline' ? act({ kind: 'toggleAll' }, s.browse.inlineShowAll ? say('collapse') : say('all')) : null,
      language: placement === 'inline' ? null : {
        label: say('language'),
        value: s.lang,
        options: LANGS.map(lang => ({ lang, label: LANG_NAMES[lang], action: act({ kind: 'setLang', lang }, LANG_NAMES[lang]) })),
      },
    },
    catalog,
    showHidden: catalog.kind === 'hidden' ? null : projectShowHidden(s, say),
  }
}

function projectShowHidden(s: Snapshot, say: Say): Action | null {
  if (s.catalog.status !== 'ready') return null
  const listed = s.catalog.groups.flatMap(g => g.skills).filter(entry => s.hidden.includes(entry.id)).length
  if (listed === 0) return null
  return act({ kind: 'toggleShowHidden' }, s.browse.showHidden ? say('collapseHidden') : say('showHidden', { n: listed }))
}

function projectRecommendation(s: Snapshot, threshold: number, say: Say): RecommendationModel {
  const r = s.recommendation
  const rerun = { ...act({ kind: 'rerun' }, say('rerun')), isDim: r.kind === 'idle' }
  const picks = (list: readonly RecommendationPick[]) => projectPicks(s.catalog, list.filter(p => !s.hidden.includes(p.skillId)), threshold, say)
  const body = ((): RecommendationModel['body'] => {
    switch (r.kind) {
      case 'idle': return { kind: 'idle' }
      case 'running': return { kind: 'running', text: say('running'), picks: picks(r.previous) }
      case 'ready': {
        const shown = picks(r.picks)
        return shown.length > 0 ? { kind: 'picks', picks: shown } : { kind: 'message', text: say('noneFits') }
      }
      case 'failed': return { kind: 'message', text: failureText(r.failure, say) }
    }
  })()
  return { heading: say('recommendation'), rerun, body }
}

function projectPicks(catalog: SkillCatalog, picks: readonly RecommendationPick[], threshold: number, say: Say): PickModel[] {
  if (catalog.status !== 'ready') return []
  const all = catalog.groups.flatMap(g => g.skills.map(entry => ({ entry, source: g.source })))
  return [...picks]
    .sort((a, b) => b.probability - a.probability)
    .filter(p => p.probability >= threshold)
    .slice(0, 3)
    .flatMap(p => {
      const found = all.find(row => row.entry.id === p.skillId)
      if (!found) return []
      const others = all.filter(row => row.entry.baseName === found.entry.baseName).length - 1
      const where = `${sourceTitle(found.source, say)} ${formatVersion(found.entry.version)}`
      return [{
        ...act({ kind: 'reveal', skillId: p.skillId }, found.entry.baseName),
        name: found.entry.baseName,
        percent: `${Math.round(p.probability * 100)}%`,
        detail: others > 0 ? `${where} · ${say('moreSources', { n: others })}` : where,
      }]
    })
}

function failureText(failure: JevFailure, say: Say): string {
  switch (failure.kind) {
    case 'network': return say('jevNetwork')
    case 'unauthorized': return say('jevUnauthorized')
    case 'quota': return say('jevQuota')
    case 'http': return say('jevHttp', { status: failure.status })
    case 'malformed': return say('jevMalformed')
  }
}

function projectCatalog(
  s: Snapshot, translations: TranslationsState | null, placement: 'dock' | 'inline', columns: number, say: Say,
): CatalogModel {
  if (s.catalog.status === 'pending') return { kind: 'message', text: say('catalogPending') }
  const query = s.browse.query.trim()
  if (placement === 'inline' && !s.browse.inlineShowAll && query === '') return { kind: 'hidden' }
  // The inline window counts rows, so a summary line under each would halve what it shows.
  const summaryWidth = placement === 'dock' ? columns - SUMMARY_INDENT : null
  const groups = projectGroups(s.catalog.groups, s.browse, s.hidden, translations, summaryWidth, say)
  if (groups.length === 0) {
    if (query !== '') return { kind: 'message', text: say('noResult', { q: query }) }
    // Every skill hidden: nothing to draw above the 顯示已隱藏 toggle.
    return s.catalog.groups.length === 0 ? { kind: 'message', text: say('catalogEmpty') } : { kind: 'groups', groups: [] }
  }
  if (placement === 'dock') return { kind: 'groups', groups }
  const rows = flatten(groups)
  const offset = Math.min(s.browse.inlineOffset, Math.max(0, rows.length - INLINE_WINDOW_ROWS))
  return {
    kind: 'window',
    rows: rows.slice(offset, offset + INLINE_WINDOW_ROWS),
    up: offset > 0 ? act({ kind: 'scroll', delta: -1 }, '▲') : null,
    down: offset + INLINE_WINDOW_ROWS < rows.length ? act({ kind: 'scroll', delta: 1 }, '▼') : null,
  }
}

function projectGroups(
  groups: readonly SourceGroup[], browse: BrowseState, hidden: readonly SkillId[], translations: TranslationsState | null,
  summaryWidth: number | null, say: Say,
): GroupModel[] {
  const query = browse.query.trim()
  return groups.flatMap(g => {
    const shown = browse.showHidden ? g.skills : g.skills.filter(entry => !hidden.includes(entry.id))
    const hits = query === '' ? shown : shown.filter(entry => matchesQuery(entry, g.source, query, translations))
    if (hits.length === 0) return []
    const isOpen = query === '' ? browse.opened.includes(g.source.id) : !browse.shutWhileSearching.includes(g.source.id)
    return [projectGroup(g, shown, hits, isOpen, query !== '', browse, hidden, translations, summaryWidth, say)]
  })
}

/** The inline window's rows: each group's header followed by its open skills. */
function flatten(groups: readonly GroupModel[]): (GroupModel | SkillModel)[] {
  return groups.flatMap(g => [{ ...g, skills: [] }, ...g.skills])
}

/** The window offset that puts a skill's row at the top, with its group header above it when there is room. */
export function inlineOffsetFor(s: Snapshot, skillId: SkillId): number {
  if (s.catalog.status !== 'ready') return 0
  const translations = s.translations.lang === s.lang ? s.translations : null
  const rows = flatten(projectGroups(s.catalog.groups, s.browse, s.hidden, translations, null, t(s.lang)))
  const at = rows.findIndex(row => row.row === 'skill' && row.intent.kind === 'toggleSkill' && row.intent.skillId === skillId)
  return Math.max(0, at - 1)
}

function projectGroup(
  g: SourceGroup, shown: readonly SkillEntry[], hits: readonly SkillEntry[], isOpen: boolean, isSearching: boolean, browse: BrowseState,
  hidden: readonly SkillId[], translations: TranslationsState | null, summaryWidth: number | null, say: Say,
): GroupModel {
  const title = sourceTitle(g.source, say)
  const version = g.source.kind === 'plugin' ? formatVersion(newest(g.source.installs.map(i => i.version))) : null
  return {
    ...act({ kind: 'toggleGroup', sourceId: g.source.id }, title),
    row: 'group',
    title,
    version,
    count: isSearching ? `${hits.length}/${shown.length}` : `${shown.length}`,
    isOpen,
    skills: isOpen ? hits.map(entry => projectSkill(entry, hidden.includes(entry.id), browse, translations, summaryWidth, say)) : [],
  }
}

function projectSkill(
  entry: SkillEntry, isHidden: boolean, browse: BrowseState, translations: TranslationsState | null, summaryWidth: number | null,
  say: Say,
): SkillModel {
  const isExpanded = browse.expanded === entry.id
  const description = shownDescription(entry, browse, translations)
  return {
    ...act({ kind: 'toggleSkill', skillId: entry.id }, entry.baseName),
    row: 'skill',
    name: entry.baseName,
    summary: isExpanded || summaryWidth === null || description === '' ? null : fitCells(firstSentence(description), summaryWidth),
    isHidden,
    isExpanded,
    detail: isExpanded ? projectDetail(entry, isHidden, browse, translations, say) : null,
  }
}

function projectDetail(
  entry: SkillEntry, isHidden: boolean, browse: BrowseState, translations: TranslationsState | null, say: Say,
): DetailModel {
  const translation = translations?.entries[translationKeyOf(entry)]
  const job = translations?.jobs[entry.id]
  const isStale = translation !== undefined && translation.sourceHash !== entry.descriptionHash
  const showsTranslation = translation !== undefined && !browse.showingOriginal.includes(entry.id)
  const original = entry.description || say('noDescription')
  return {
    meta: `/${entry.name} · ${formatVersion(entry.version)}`,
    text: showsTranslation ? translation.text : original,
    badge: showsTranslation && isStale ? say('stale') : null,
    status: job === 'running' ? say('translating') : job === 'failed' ? say('translateFailed') : null,
    alsoIn: entry.marketplaces.length > 1 ? say('alsoIn', { list: entry.marketplaces.join(', ') }) : null,
    translate: job !== 'running' && entry.description !== '' && (translation === undefined || isStale)
      ? act({ kind: 'translate', skillId: entry.id }, say('translate'))
      : null,
    toggleOriginal: translation === undefined
      ? null
      : act({ kind: 'toggleOriginal', skillId: entry.id }, showsTranslation ? say('showOriginal') : say('showTranslation')),
    fill: act({ kind: 'fill', skillId: entry.id }, say('fill')),
    hide: isHidden ? act({ kind: 'unhide', skillId: entry.id }, say('unhide')) : act({ kind: 'hide', skillId: entry.id }, say('hide')),
  }
}

/** The translation unless the person flipped to the original; the original otherwise. */
function shownDescription(entry: SkillEntry, browse: BrowseState, translations: TranslationsState | null): string {
  const translation = translations?.entries[translationKeyOf(entry)]
  return translation !== undefined && !browse.showingOriginal.includes(entry.id) ? translation.text : entry.description
}

/** Lines up under the name after the row's `  · `. */
const SUMMARY_INDENT = 4

function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.match(/^.*?(?:[.!?](?=\s|$)|[。！？]|$)/)?.[0] ?? flat
}

// East Asian wide ranges take two cells; enough for the scripts the Translation File holds.
const WIDE = /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/

const cellsOf = (ch: string) => (WIDE.test(ch) ? 2 : 1)

/** Cut to `width` terminal cells with an ellipsis, for a surface that wraps rather than truncates. */
function fitCells(text: string, width: number): string {
  if ([...text].reduce((n, ch) => n + cellsOf(ch), 0) <= width) return text
  let used = 1
  let out = ''
  for (const ch of text) {
    if (used + cellsOf(ch) > width) break
    used += cellsOf(ch)
    out += ch
  }
  return `${out}…`
}

function sourceTitle(source: Source, say: Say): string {
  switch (source.kind) {
    case 'plugin': return source.plugin
    case 'user': return say('user')
    case 'project': return say('project')
    case 'builtin': return say('builtin')
    case 'other': return source.engineWord
  }
}

/** Case-insensitive over the name, the plugin name, the original and the active language's translation. */
export function matchesQuery(entry: SkillEntry, source: Source, query: string, translations: TranslationsState | null): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  const haystack = [
    entry.name, entry.baseName, source.kind === 'plugin' ? source.plugin : '', entry.description,
    translations?.entries[translationKeyOf(entry)]?.text ?? '',
  ]
  return haystack.some(text => text.toLowerCase().includes(needle))
}

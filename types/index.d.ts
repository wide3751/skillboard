// The Skillboard domain and its $.state contract. Each atom is created inside
// the one module that writes it; every other module only reads it:
//   catalog         hooks/catalog.ts
//   recommendation  hooks/recommend.ts
//   translations    hooks/translate.ts
//   language        hooks/i18n.ts
//   browse          hooks/browse.ts

export type Lang = 'zh-TW' | 'en' | 'ja' | 'zh-CN'

/** 'plugin:<name>' | 'user' | 'project' | 'builtin' | 'other:<engine word>'. Never carries a version. */
export type SourceId = string & { readonly __brand: 'SourceId' }

/** `${SourceId}|${name}`: one per Skill Catalog row. */
export type SkillId = string & { readonly __brand: 'SkillId' }

export type Version =
  | { kind: 'semver'; text: string; parts: readonly [number, number, number]; pre: string | null }
  | { kind: 'sha'; text: string; updatedAtMs: number | null }
  | { kind: 'unknown'; updatedAtMs: number | null }

/** One enabled install of a plugin, as installed_plugins.json records it. */
export type PluginInstall = { marketplace: string; installPath: string; version: Version }

/** A plugin Source is keyed by plugin name: the session loads one copy however many marketplaces installed it. */
export type Source =
  | { kind: 'plugin'; id: SourceId; plugin: string; installs: readonly PluginInstall[] }
  | { kind: 'user'; id: SourceId }
  | { kind: 'project'; id: SourceId }
  | { kind: 'builtin'; id: SourceId }
  | { kind: 'other'; id: SourceId; engineWord: string }

export type SkillEntry = {
  id: SkillId
  /** As the session lists it, e.g. 'mattpocock-skills:tdd'; what 填入 writes. */
  name: string
  /** `name` without its `<plugin>:` prefix: the Recommendation merge key. */
  baseName: string
  sourceId: SourceId
  version: Version
  /** Plugin skills only: the marketplaces of the installs that ship it. */
  marketplaces: readonly string[]
  description: string
  descriptionHash: string
}

export type SourceGroup = { source: Source; skills: readonly SkillEntry[] }

/** Groups are stored ordered: plugins by name, then user, project, builtin, other; skills by baseName. */
export type SkillCatalog =
  | { status: 'pending' }
  | { status: 'ready'; fingerprint: string; groups: readonly SourceGroup[] }

/** Jev's raw top 3; the threshold and the join to the catalog happen at projection. */
export type RecommendationPick = { skillId: SkillId; probability: number }

export type JevFailure =
  | { kind: 'network' }
  | { kind: 'unauthorized' }
  | { kind: 'quota' }
  | { kind: 'http'; status: number }
  | { kind: 'malformed' }

/** `ticket` is the supersession token: a run writes only while the atom still holds its ticket. */
export type RecommendationState =
  | { kind: 'idle'; ticket: number }
  | { kind: 'running'; ticket: number; prompt: string; previous: readonly RecommendationPick[] }
  | { kind: 'ready'; ticket: number; prompt: string; picks: readonly RecommendationPick[] }
  | { kind: 'failed'; ticket: number; prompt: string; failure: JevFailure }

/** `${SourceId} / ${baseName}`: a Translation File section heading. */
export type TranslationKey = string & { readonly __brand: 'TranslationKey' }

export type TranslationEntry = { text: string; sourceHash: string }

/** One language's Translation File as loaded; `lang` says which file, the language atom says which is active. */
export type TranslationsState = {
  lang: Lang
  mtimeMs: number | null
  entries: Readonly<Record<string, TranslationEntry>>
  jobs: Readonly<Record<string, 'running' | 'failed'>>
}

export type BrowseState = {
  query: string
  expanded: SkillId | null
  /** Groups opened while not searching. */
  opened: readonly SourceId[]
  /** Groups shut while searching; cleared whenever the query changes. */
  shutWhileSearching: readonly SourceId[]
  showingOriginal: readonly SkillId[]
  inlineShowAll: boolean
  /** First visible row of the inline window; clamped at projection. */
  inlineOffset: number
}

/** Everything a person can press, type or pick in the Skills Pane. */
export type Intent =
  | { kind: 'search'; query: string }
  | { kind: 'toggleGroup'; sourceId: SourceId }
  | { kind: 'toggleSkill'; skillId: SkillId }
  | { kind: 'toggleOriginal'; skillId: SkillId }
  | { kind: 'reveal'; skillId: SkillId }
  | { kind: 'toggleAll' }
  | { kind: 'scroll'; delta: -1 | 1 }
  | { kind: 'refresh' }
  | { kind: 'rerun' }
  | { kind: 'translate'; skillId: SkillId }
  | { kind: 'fill'; skillId: SkillId }
  | { kind: 'setLang'; lang: Lang }

export type SkillboardOptions = {
  /** '' means no Jev: no Recommendation section and no request. */
  jevApiKey: string
  threshold: number
  autoRecommend: boolean
  /** null means detect. */
  language: Lang | null
}

/** $.store 'language': the pane's choice, honoured while userConfig.language still holds `configWas`. */
export type StoredLanguageChoice = { lang: Lang; configWas: Lang | null }

declare module 'claude-code' {
  interface PluginState {
    skillboard: {
      catalog: SkillCatalog
      recommendation: RecommendationState
      translations: TranslationsState
      language: Lang
      browse: BrowseState
    }
  }
}

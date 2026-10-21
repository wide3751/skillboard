import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import type { SkillEntry, TranslationKey, TranslationsState } from '../types'

const translations = atom(
  { plugin: 'skillboard', key: 'translations' } as const,
  { lang: 'en', mtimeMs: null, entries: {}, jobs: {} } as TranslationsState,
)

export function readTranslations($: EngineInterface): Promise<TranslationsState> {
  return read($, translations)
}

/** The section heading of a skill in a Translation File: version-free, so an upgrade keeps it. */
export const translationKeyOf = (skill: SkillEntry): TranslationKey => `${skill.sourceId} / ${skill.baseName}` as TranslationKey

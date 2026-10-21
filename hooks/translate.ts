// Translation Files: one Markdown file per language under the user's config,
// a section per skill. Haiku writes a section on 翻譯; people may edit any of it.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import type { Lang, SkillEntry, SkillId, SourceId, TranslationEntry, TranslationKey, TranslationsState } from '../types'

const translations = atom(
  { plugin: 'skillboard', key: 'translations' } as const,
  { lang: 'en', mtimeMs: null, entries: {}, jobs: {}, batches: {} } as TranslationsState,
)

export function readTranslations($: EngineInterface): Promise<TranslationsState> {
  return read($, translations)
}

/** The section heading of a skill in a Translation File: version-free, so an upgrade keeps it. */
export const translationKeyOf = (skill: SkillEntry): TranslationKey => `${skill.sourceId} / ${skill.baseName}` as TranslationKey

function translationPath(home: string, lang: Lang): string {
  return `${home}/.claude/skillboard/translations/${lang}.md`
}

/** Loads `lang`'s file when the language or the file's mtime changed, so hand edits show on the next sync. */
export async function syncTranslations($: EngineInterface, home: string, lang: Lang): Promise<void> {
  const path = translationPath(home, lang)
  const stat = await attempt(() => $.fs.stat(path), null)
  const mtimeMs = stat?.mtimeMs ?? null
  const current = await read($, translations)
  if (current.lang === lang && current.mtimeMs === mtimeMs && stat !== null) return
  if (current.lang === lang && stat === null && Object.keys(current.entries).length === 0) return
  const text = stat === null ? '' : await attempt(() => readText($, path), '')
  const entries = entriesOf(parseTranslationFile(text))
  await update($, translations, (latest): TranslationsState =>
    latest.lang === lang ? { ...latest, mtimeMs, entries } : { lang, mtimeMs, entries, jobs: {}, batches: {} })
}

/** A reload drops the module whose runs these were, so nothing would ever finish them. */
export async function settleOrphanedTranslations($: EngineInterface): Promise<void> {
  await update($, translations, (current): TranslationsState => ({
    ...current,
    jobs: Object.fromEntries(Object.entries(current.jobs).filter(([, job]) => job !== 'running')),
    batches: Object.fromEntries(Object.entries(current.batches).filter(([, batch]) => batch.kind !== 'running')),
  }))
}

/** What 翻譯此分類 would send: listed, not hidden, with a description, and no current translation. */
export function untranslated(
  skills: readonly SkillEntry[], hidden: readonly SkillId[], current: TranslationsState | null,
): SkillEntry[] {
  return skills.filter(entry => {
    if (entry.description === '' || hidden.includes(entry.id)) return false
    return current?.entries[translationKeyOf(entry)]?.sourceHash !== entry.descriptionHash
  })
}

const GROUP_CONCURRENCY = 3

/** Translates `skills` for one group, three at a time; a second press while it runs does nothing. */
export async function translateGroup(
  $: EngineInterface, home: string, lang: Lang, sourceId: SourceId, skills: readonly SkillEntry[],
): Promise<void> {
  let claimed = false
  await update($, translations, (current): TranslationsState => {
    claimed = current.lang === lang && current.batches[sourceId]?.kind !== 'running' && skills.length > 0
    return claimed ? { ...current, batches: { ...current.batches, [sourceId]: { kind: 'running', done: 0, total: skills.length } } } : current
  })
  if (!claimed) return

  const queue = [...skills]
  let failed = 0
  const worker = async () => {
    for (let skill = queue.shift(); skill; skill = queue.shift()) {
      if ((await translateSkill($, home, lang, skill)) === 'failed') failed += 1
      await update($, translations, (current): TranslationsState => {
        const batch = current.batches[sourceId]
        if (current.lang !== lang || batch?.kind !== 'running') return current
        return { ...current, batches: { ...current.batches, [sourceId]: { ...batch, done: batch.done + 1 } } }
      })
    }
  }
  await Promise.all(Array.from({ length: Math.min(GROUP_CONCURRENCY, skills.length) }, worker))
  await update($, translations, (current): TranslationsState => {
    if (current.lang !== lang || current.batches[sourceId]?.kind !== 'running') return current
    const batches = Object.fromEntries(Object.entries(current.batches).filter(([id]) => id !== sourceId))
    return { ...current, batches: failed > 0 ? { ...batches, [sourceId]: { kind: 'failed', failed } } : batches }
  })
}

/** Every Translation File write goes through here: concurrent translations each re-read the file, so unqueued they would drop each other's sections. */
let writing: Promise<unknown> = Promise.resolve()

function serialized<T>(write: () => Promise<T>): Promise<T> {
  const run = writing.then(write, write)
  writing = run.catch(() => undefined)
  return run
}

const LANGUAGE_NAMES: Record<Lang, string> = {
  'zh-TW': 'Traditional Chinese as written in Taiwan',
  en: 'English',
  ja: 'Japanese',
  'zh-CN': 'Simplified Chinese',
}

/**
 * Asks Haiku for `lang`, then rewrites only that skill's section, reading the
 * file again right before writing so an edit made meanwhile elsewhere survives.
 */
export async function translateSkill(
  $: EngineInterface, home: string, lang: Lang, skill: SkillEntry,
): Promise<'translated' | 'failed' | 'busy'> {
  let claimed = false
  await update($, translations, (current): TranslationsState => {
    claimed = current.jobs[skill.id] !== 'running'
    return claimed ? { ...current, jobs: { ...current.jobs, [skill.id]: 'running' } } : current
  })
  if (!claimed) return 'busy'

  const result = await attempt(
    () =>
      $.model.complete({
        model: 'haiku',
        system: `Translate the description of a Claude Code skill into ${LANGUAGE_NAMES[lang]}. Reply with the translation only. Keep skill names, slash commands, file names and code exactly as written.`,
        prompt: skill.description,
        maxTokens: 2048,
      }),
    null,
  )
  const text = result?.isAnswered ? result.text.trim() : ''
  if (text === '') {
    await update($, translations, (current): TranslationsState => ({ ...current, jobs: { ...current.jobs, [skill.id]: 'failed' } }))
    return 'failed'
  }

  await serialized(async () => {
    const path = translationPath(home, lang)
    const file = parseTranslationFile(await attempt(() => readText($, path), ''))
    const written = serialize(upsert(file, translationKeyOf(skill), { text, sourceHash: skill.descriptionHash }), lang)
    await $.fs.write(path, written)
    const stat = await attempt(() => $.fs.stat(path), null)
    await update($, translations, (current): TranslationsState => {
      const jobs = Object.fromEntries(Object.entries(current.jobs).filter(([id]) => id !== skill.id))
      if (current.lang !== lang) return { ...current, jobs }
      return { ...current, mtimeMs: stat?.mtimeMs ?? null, entries: entriesOf(parseTranslationFile(written)), jobs }
    })
  })
  return 'translated'
}

/**
 * A Translation File:
 *   # anything (kept verbatim)
 *   ## <TranslationKey>
 *   <!-- source-hash: 1a2b3c4d -->
 *   translated text, hand-editable
 * Sections keep their raw text so an upsert rewrites one section's bytes only.
 */
type ParsedFile = { preamble: string; sections: readonly { key: string; raw: string }[] }

function parseTranslationFile(text: string): ParsedFile {
  const parts = text.split(/^(?=## )/m)
  const preamble = parts[0]?.startsWith('## ') ? '' : (parts.shift() ?? '')
  return {
    preamble,
    sections: parts.map(raw => {
      const end = raw.indexOf('\n')
      return { key: raw.slice(3, end < 0 ? raw.length : end).trim(), raw }
    }),
  }
}

const HASH_LINE = /<!--\s*source-hash:\s*([0-9a-f]*)\s*-->/

function entriesOf(file: ParsedFile): Record<string, TranslationEntry> {
  return Object.fromEntries(
    file.sections.map(({ key, raw }) => {
      const end = raw.indexOf('\n')
      const body = end < 0 ? '' : raw.slice(end + 1)
      const hash = HASH_LINE.exec(body)
      return [key, { text: body.replace(HASH_LINE, '').trim(), sourceHash: hash?.[1] ?? '' }]
    }),
  )
}

function upsert(file: ParsedFile, key: TranslationKey, entry: TranslationEntry): ParsedFile {
  const raw = `## ${key}\n<!-- source-hash: ${entry.sourceHash} -->\n${entry.text}\n\n`
  const at = file.sections.findIndex(s => s.key === key)
  if (at >= 0) return { ...file, sections: file.sections.map((s, i) => (i === at ? { key, raw } : s)) }
  const sections = file.sections.map((s, i) =>
    i === file.sections.length - 1 && !s.raw.endsWith('\n') ? { ...s, raw: `${s.raw}\n` } : s,
  )
  return { ...file, sections: [...sections, { key, raw }] }
}

function serialize(file: ParsedFile, lang: Lang): string {
  const preamble =
    file.preamble === '' && file.sections.length <= 1
      ? `# Skillboard translations (${lang})\n\nOne section per skill. Edit any text freely; the source-hash line records which original it translates.\n\n`
      : file.preamble === '' || file.preamble.endsWith('\n') ? file.preamble : `${file.preamble}\n`
  return preamble + file.sections.map(s => s.raw).join('')
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

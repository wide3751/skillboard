import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import type { Lang } from '../types'

const language = atom({ plugin: 'skillboard', key: 'language' } as const, 'en' as Lang)

export function readLanguage($: EngineInterface): Promise<Lang> {
  return read($, language)
}

const EN = {
  paneTitle: 'Skills',
  commandDescription: 'Toggle the Skills Pane',
  search: 'Search skills',
  refresh: 'Refresh',
  language: 'Language',
  catalogPending: 'Loading skills…',
  catalogEmpty: 'No skills in this session',
  noResult: 'No skill matches “{q}”',
  user: 'User',
  project: 'Project',
  builtin: 'Built-in',
  noDescription: '(no description)',
  alsoIn: 'Installed from: {list}',
  fill: 'Fill',
  recommendation: 'Recommended',
  rerun: 'Re-suggest',
  running: 'Finding skills…',
  noneFits: 'No skill stands out',
  jevUnauthorized: 'Jev rejected the API key',
  jevQuota: 'Jev quota used up',
  jevNetwork: 'Could not reach Jev',
  jevHttp: 'Jev failed (HTTP {status})',
  jevMalformed: 'Jev sent a reply Skillboard could not read',
  moreSources: '+{n} more Sources',
  all: 'All',
  collapse: 'Hide',
  translate: 'Translate',
  showOriginal: 'Original',
  showTranslation: 'Translation',
  translating: 'Translating…',
  translateFailed: 'Translation failed',
  stale: 'Outdated',
  copied: 'Copied {text}: paste it into the prompt',
  copyFailed: 'Could not fill or copy {text}',
} as const

export type MessageId = keyof typeof EN
export type Say = (id: MessageId, vars?: Readonly<Record<string, string | number>>) => string

const DICTS: Record<Lang, Record<MessageId, string>> = { en: EN, 'zh-TW': EN, ja: EN, 'zh-CN': EN }

export function t(lang: Lang): Say {
  const dict = DICTS[lang]
  return (id, vars) => dict[id].replace(/\{(\w+)\}/g, (whole, name: string) => String(vars?.[name] ?? whole))
}

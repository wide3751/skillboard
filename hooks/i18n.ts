// The interface language: four dictionaries, detection, and the pane's switch.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import type { Lang, StoredLanguageChoice } from '../types'

const language = atom({ plugin: 'skillboard', key: 'language' } as const, 'en' as Lang)

export function readLanguage($: EngineInterface): Promise<Lang> {
  return read($, language)
}

const STORE_KEY = 'language'

/**
 * The pane's own choice wins while userConfig.language still holds the value
 * it was made under; after that userConfig, Claude Code's `language` setting,
 * LC_ALL, LANG, the macOS preferred language, then English.
 */
export async function resolveLanguage($: EngineInterface, option: Lang | null): Promise<Lang> {
  const stored = (await $.store.get(STORE_KEY)) as Partial<StoredLanguageChoice> | undefined
  const settings = await $.settings.read()
  const lang =
    (stored && isLang(stored.lang) && (stored.configWas ?? null) === option ? stored.lang : null) ??
    option ??
    matchLang(settings.language) ??
    matchLang(await $.env.get('LC_ALL')) ??
    matchLang(await $.env.get('LANG')) ??
    matchLang(await macLanguage($)) ??
    'en'
  await update($, language, () => lang)
  return lang
}

export async function chooseLanguage($: EngineInterface, lang: Lang, option: Lang | null): Promise<void> {
  const choice: StoredLanguageChoice = { lang, configWas: option }
  await $.store.set(STORE_KEY, choice)
  await update($, language, () => lang)
}

/**
 * The first of the person's preferred languages in System Settings, as
 * `defaults` prints it: `(\n    "zh-Hant-TW",\n    "en-US"\n)`. The Desktop app
 * starts sessions with no LANG, and `Intl` in a hooks module answers en-US
 * whatever the system is set to, so only macOS itself can say.
 */
async function macLanguage($: EngineInterface): Promise<string | null> {
  try {
    const { exitCode, stdout } = await $.process.run(['defaults', 'read', '-g', 'AppleLanguages'], { timeoutMs: 3000 })
    return exitCode === 0 ? (/^\s*"?([A-Za-z][\w-]*)"?,?\s*$/m.exec(stdout)?.[1] ?? null) : null
  } catch {
    return null
  }
}

const LANGS: readonly Lang[] = ['zh-TW', 'en', 'ja', 'zh-CN']

export function isLang(value: unknown): value is Lang {
  return LANGS.includes(value as Lang)
}

/** Locale text in any of its spellings: 'zh_TW.UTF-8', 'zh-Hant', '繁體中文', 'Japanese', 'en_US'. */
function matchLang(text: unknown): Lang | null {
  if (typeof text !== 'string') return null
  const s = text.trim().toLowerCase()
  if (/^zh[-_](tw|hk|mo|hant)|traditional|繁/.test(s)) return 'zh-TW'
  if (/^zh([-_.]|$)|chinese|简|簡|中文/.test(s)) return 'zh-CN'
  if (/^ja([-_.]|$)|japanese|日本/.test(s)) return 'ja'
  if (/^en([-_.]|$)|english/.test(s)) return 'en'
  return null
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
  translateGroup: 'Translate this group ({n})',
  translatingGroup: 'Translating {k}/{n}',
  groupFailed: '{n} failed to translate',
  stale: 'Outdated',
  copied: 'Copied {text}: paste it into the prompt',
  copyFailed: 'Could not fill or copy {text}',
  hide: 'Hide skill',
  unhide: 'Unhide',
  showHidden: 'Show hidden ({n})',
  collapseHidden: 'Collapse hidden',
} as const

export type MessageId = keyof typeof EN
export type Say = (id: MessageId, vars?: Readonly<Record<string, string | number>>) => string

const ZH_TW: Record<MessageId, string> = {
  paneTitle: 'Skills',
  commandDescription: '開關 Skills Pane',
  search: '搜尋 skill',
  refresh: '重新整理',
  language: '語言',
  catalogPending: '正在讀取 skill…',
  catalogEmpty: '這個 session 沒有 skill',
  noResult: '沒有符合「{q}」的 skill',
  user: '使用者層',
  project: '專案層',
  builtin: '內建',
  noDescription: '（沒有說明）',
  alsoIn: '安裝來源：{list}',
  fill: '填入',
  recommendation: '建議',
  rerun: '重新建議',
  running: '正在找適合的 skill…',
  noneFits: '沒有特別適合的 skill',
  jevUnauthorized: 'Jev 拒絕了 API key',
  jevQuota: 'Jev 額度已用完',
  jevNetwork: '連不上 Jev',
  jevHttp: 'Jev 呼叫失敗（HTTP {status}）',
  jevMalformed: '無法解讀 Jev 的回應',
  moreSources: '還有 {n} 個 Source',
  all: '全部',
  collapse: '收起',
  translate: '翻譯',
  showOriginal: '原文',
  showTranslation: '譯文',
  translating: '翻譯中…',
  translateFailed: '翻譯失敗',
  translateGroup: '翻譯此分類（{n}）',
  translatingGroup: '翻譯中 {k}/{n}',
  groupFailed: '{n} 個翻譯失敗',
  stale: '已過期',
  copied: '已複製 {text}，請貼到輸入框',
  copyFailed: '無法填入也無法複製 {text}',
  hide: '隱藏',
  unhide: '取消隱藏',
  showHidden: '顯示已隱藏（{n}）',
  collapseHidden: '收起已隱藏',
}

const JA: Record<MessageId, string> = {
  paneTitle: 'Skills',
  commandDescription: 'Skills Pane を開閉する',
  search: 'skill を検索',
  refresh: '再読み込み',
  language: '言語',
  catalogPending: 'skill を読み込み中…',
  catalogEmpty: 'このセッションに skill はありません',
  noResult: '「{q}」に一致する skill はありません',
  user: 'ユーザー',
  project: 'プロジェクト',
  builtin: '組み込み',
  noDescription: '（説明なし）',
  alsoIn: 'インストール元：{list}',
  fill: '入力',
  recommendation: 'おすすめ',
  rerun: '再提案',
  running: 'skill を探しています…',
  noneFits: '特に合う skill はありません',
  jevUnauthorized: 'Jev が API key を拒否しました',
  jevQuota: 'Jev の利用枠を使い切りました',
  jevNetwork: 'Jev に接続できません',
  jevHttp: 'Jev の呼び出しに失敗しました（HTTP {status}）',
  jevMalformed: 'Jev の応答を読み取れません',
  moreSources: 'ほかに {n} 個の Source',
  all: 'すべて',
  collapse: '閉じる',
  translate: '翻訳',
  showOriginal: '原文',
  showTranslation: '訳文',
  translating: '翻訳中…',
  translateFailed: '翻訳に失敗しました',
  translateGroup: 'このグループを翻訳（{n}）',
  translatingGroup: '翻訳中 {k}/{n}',
  groupFailed: '{n} 件の翻訳に失敗しました',
  stale: '古い訳文',
  copied: '{text} をコピーしました。入力欄に貼り付けてください',
  copyFailed: '{text} を入力もコピーもできませんでした',
  hide: '非表示',
  unhide: '再表示',
  showHidden: '非表示を表示（{n}）',
  collapseHidden: '非表示をたたむ',
}

const ZH_CN: Record<MessageId, string> = {
  paneTitle: 'Skills',
  commandDescription: '打开或关闭 Skills Pane',
  search: '搜索 skill',
  refresh: '刷新',
  language: '语言',
  catalogPending: '正在读取 skill…',
  catalogEmpty: '此 session 没有 skill',
  noResult: '没有符合“{q}”的 skill',
  user: '用户层',
  project: '项目层',
  builtin: '内置',
  noDescription: '（没有说明）',
  alsoIn: '安装来源：{list}',
  fill: '填入',
  recommendation: '建议',
  rerun: '重新建议',
  running: '正在寻找合适的 skill…',
  noneFits: '没有特别合适的 skill',
  jevUnauthorized: 'Jev 拒绝了 API key',
  jevQuota: 'Jev 额度已用完',
  jevNetwork: '无法连接 Jev',
  jevHttp: 'Jev 调用失败（HTTP {status}）',
  jevMalformed: '无法解读 Jev 的回应',
  moreSources: '还有 {n} 个 Source',
  all: '全部',
  collapse: '收起',
  translate: '翻译',
  showOriginal: '原文',
  showTranslation: '译文',
  translating: '翻译中…',
  translateFailed: '翻译失败',
  translateGroup: '翻译此分类（{n}）',
  translatingGroup: '翻译中 {k}/{n}',
  groupFailed: '{n} 个翻译失败',
  stale: '已过期',
  copied: '已复制 {text}，请粘贴到输入框',
  copyFailed: '无法填入也无法复制 {text}',
  hide: '隐藏',
  unhide: '取消隐藏',
  showHidden: '显示已隐藏（{n}）',
  collapseHidden: '收起已隐藏',
}

const DICTS: Record<Lang, Record<MessageId, string>> = { en: EN, 'zh-TW': ZH_TW, ja: JA, 'zh-CN': ZH_CN }

export function t(lang: Lang): Say {
  const dict = DICTS[lang]
  return (id, vars) => dict[id].replace(/\{(\w+)\}/g, (whole, name: string) => String(vars?.[name] ?? whole))
}

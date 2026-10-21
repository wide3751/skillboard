import type { PluginOptions, Register } from 'claude-code'
import { readBrowse } from './browse'
import { readCatalog, refreshCatalog, type ScanRoots } from './catalog'
import { readLanguage, t } from './i18n'
import { dispatch, type DispatchContext } from './intents'
import { paint } from './paint'
import { readRecommendation } from './recommend'
import { readTranslations } from './translate'
import { project } from './view'
import type { Lang, SkillboardOptions } from '../types'

const PANE = 'skillboard'
const COMMAND = 'skillboard'
const LANGS: readonly string[] = ['zh-TW', 'en', 'ja', 'zh-CN']

function parseOptions(raw: PluginOptions): SkillboardOptions {
  const threshold = typeof raw.threshold === 'number' && raw.threshold >= 0 && raw.threshold <= 1 ? raw.threshold : 0.1
  return {
    jevApiKey: typeof raw.jevApiKey === 'string' ? raw.jevApiKey.trim() : '',
    threshold,
    autoRecommend: raw.autoRecommend !== false,
    language: typeof raw.language === 'string' && LANGS.includes(raw.language) ? (raw.language as Lang) : null,
  }
}

/** Work that outlives its dispatch. A reload drops the module under it, and its calls then reject with nothing left to tell. */
function inBackground(work: Promise<unknown>): void {
  work.catch(() => undefined)
}

export const register: Register = (on, raw) => {
  const options = parseOptions(raw)
  let roots: ScanRoots | null = null
  const ctx: DispatchContext = { options, roots: () => roots }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const scanRoots: ScanRoots = { cwd: started.cwd, home: (await $.env.get('HOME')) ?? '' }
    roots = scanRoots
    const say = t(await readLanguage($))
    await $.command.register({ name: COMMAND, description: say('commandDescription') })
    inBackground(refreshCatalog($, scanRoots, false))
    return started
  })

  on('command.run', { command: COMMAND }, async $ => {
    const isShown = (await $.ui.panes()).some(p => p.id === PANE && p.isShown)
    if (isShown) {
      await $.ui.close({ id: PANE })
      return { text: '' }
    }
    await $.ui.open({ id: PANE, title: t(await readLanguage($))('paneTitle') })
    if (roots && (await readCatalog($)).status === 'pending') inBackground(refreshCatalog($, roots, false))
    return { text: '' }
  })

  on('prompt.submit', async ($, e, next) => {
    const entered = await next(e)
    if (entered.drop !== undefined || e.command || e.isMeta || (e.origin && e.origin.kind !== 'composer')) return entered
    if (roots) inBackground(refreshCatalog($, roots, false))
    return entered
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const [catalog, recommendation, translations, browse, lang] = await Promise.all([
      readCatalog($), readRecommendation($), readTranslations($), readBrowse($), readLanguage($),
    ])
    const model = project({ catalog, recommendation, translations, browse, lang }, e.props.placement, {
      hasJev: options.jevApiKey !== '',
      threshold: options.threshold,
    })
    return paint($, e, model, (intent, surface) => inBackground(dispatch($, intent, surface, ctx)))
  })
}

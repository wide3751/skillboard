import type { EngineInterface, PluginOptions, Register } from 'claude-code'
import { readBrowse } from './browse'
import { readCatalog, refreshCatalog, type ScanRoots } from './catalog'
import { readLanguage, resolveLanguage, t } from './i18n'
import { dispatch, type DispatchContext } from './intents'
import { paint } from './paint'
import { clearRecommendation, readRecommendation, recommend, settleOrphanedRun } from './recommend'
import { readTranslations, syncTranslations } from './translate'
import { PANE_ID, project } from './view'
import type { Lang, SkillboardOptions } from '../types'

const COMMAND = 'skillboard'
// Desktop sends the person's prompts as an SDK host, and Remote Control as a bridge.
const PERSON_ORIGINS: readonly string[] = ['composer', 'bridge', 'sdk']
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

/** A submitted prompt may follow a plugin install, so the catalog catches up before Jev ranks it. */
async function afterSubmit($: EngineInterface, roots: ScanRoots, text: string, options: SkillboardOptions): Promise<void> {
  const catalog = await refreshCatalog($, roots, false)
  await syncTranslations($, roots.home, await readLanguage($))
  if (options.autoRecommend) await recommend($, catalog, text, options.jevApiKey)
}

/** Opening retries a scan the listing was not ready for, and picks up hand edits to the Translation File. */
async function afterOpen($: EngineInterface, roots: ScanRoots): Promise<void> {
  if ((await readCatalog($)).status === 'pending') await refreshCatalog($, roots, false)
  await syncTranslations($, roots.home, await readLanguage($))
}

export const register: Register = (on, raw) => {
  const options = parseOptions(raw)
  let roots: ScanRoots | null = null
  const ctx: DispatchContext = { options, roots: () => roots }

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const scanRoots: ScanRoots = { cwd: started.cwd, home: (await $.env.get('HOME')) ?? '' }
    roots = scanRoots
    await settleOrphanedRun($)
    const lang = await resolveLanguage($, options.language)
    await syncTranslations($, scanRoots.home, lang)
    const say = t(lang)
    await $.command.register({ name: COMMAND, description: say('commandDescription') })
    inBackground(refreshCatalog($, scanRoots, false))
    return started
  })

  on('command.run', { command: COMMAND }, async $ => {
    const isShown = (await $.ui.panes()).some(p => p.id === PANE_ID && p.isShown)
    if (isShown) {
      await $.ui.close({ id: PANE_ID })
      return {}
    }
    await $.ui.open({ id: PANE_ID, title: t(await readLanguage($))('paneTitle') })
    if (roots) inBackground(afterOpen($, roots))
    return {}
  })

  on('prompt.submit', async ($, e, next) => {
    const entered = await next(e)
    if (entered.drop !== undefined || e.command || e.isMeta || (e.origin && !PERSON_ORIGINS.includes(e.origin.kind))) return entered
    if (roots) inBackground(afterSubmit($, roots, e.text, options))
    return entered
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await clearRecommendation($)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
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

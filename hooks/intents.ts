// The one place a press, an edit or a pick turns into effects. Each intent is
// handed to the module that owns what it changes.
import type { EngineInterface, RenderSurface } from 'claude-code'
import { changeBrowse, readBrowse } from './browse'
import { readCatalog, refreshCatalog, type ScanRoots } from './catalog'
import { fillSkill } from './fill'
import { chooseLanguage, readLanguage, t } from './i18n'
import { readRecommendation, recommend } from './recommend'
import { readTranslations, syncTranslations, translateSkill } from './translate'
import { PANE_ID, inlineOffsetFor, keyOf, matchesQuery } from './view'
import type { Intent, SkillCatalog, SkillEntry, SkillId, SkillboardOptions } from '../types'

export type DispatchContext = {
  options: SkillboardOptions
  /** Set by session.start, which every reload re-runs; null only before it. */
  roots: () => ScanRoots | null
}

export async function dispatch($: EngineInterface, intent: Intent, surface: RenderSurface, ctx: DispatchContext): Promise<void> {
  const roots = ctx.roots()
  switch (intent.kind) {
    case 'search':
    case 'toggleGroup':
    case 'toggleSkill':
    case 'toggleOriginal':
    case 'toggleAll':
    case 'scroll':
      await changeBrowse($, intent)
      return
    case 'refresh':
      if (!roots) return
      await refreshCatalog($, roots, true)
      await syncTranslations($, roots.home, await readLanguage($))
      return
    case 'reveal': {
      const [catalog, translations, browse, lang] = await Promise.all([
        readCatalog($), readTranslations($), readBrowse($), readLanguage($),
      ])
      if (catalog.status !== 'ready') return
      const group = catalog.groups.find(g => g.skills.some(s => s.id === intent.skillId))
      const skill = group?.skills.find(s => s.id === intent.skillId)
      if (!group || !skill) return
      const visible = matchesQuery(skill, group.source, browse.query, translations.lang === lang ? translations : null)
      const revealed = await changeBrowse($, { kind: 'reveal', skillId: skill.id, sourceId: group.source.id, isHiddenByQuery: !visible })
      const offset = inlineOffsetFor({ catalog, recommendation: await readRecommendation($), translations, browse: revealed, lang }, skill.id)
      await changeBrowse($, { kind: 'scrollTo', offset })
      await $.ui.scroll({ to: { key: keyOf({ kind: 'toggleSkill', skillId: skill.id }) }, in: PANE_ID, block: 'start' })
      return
    }
    case 'rerun': {
      const current = await readRecommendation($)
      const prompt = current.kind === 'idle' ? (await $.prompt.read()).text : current.prompt
      if (prompt.trim() !== '') await recommend($, await readCatalog($), prompt, ctx.options.jevApiKey)
      return
    }
    case 'fill': {
      const skill = findSkill(await readCatalog($), intent.skillId)
      if (skill) await fillSkill($, skill.name, surface, t(await readLanguage($)))
      return
    }
    case 'translate': {
      const skill = findSkill(await readCatalog($), intent.skillId)
      if (skill && roots) await translateSkill($, roots.home, await readLanguage($), skill)
      return
    }
    case 'setLang':
      await chooseLanguage($, intent.lang, ctx.options.language)
      if (roots) await syncTranslations($, roots.home, intent.lang)
      return
  }
}

function findSkill(catalog: SkillCatalog, id: SkillId): SkillEntry | undefined {
  return catalog.status === 'ready' ? catalog.groups.flatMap(g => g.skills).find(s => s.id === id) : undefined
}

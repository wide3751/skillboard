// The one place a press, an edit or a pick turns into effects. Each intent is
// handed to the module that owns what it changes.
import type { EngineInterface, RenderSurface } from 'claude-code'
import { changeBrowse } from './browse'
import { refreshCatalog, type ScanRoots } from './catalog'
import type { Intent, SkillboardOptions } from '../types'

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
      if (roots) await refreshCatalog($, roots, true)
      return
    case 'reveal':
    case 'rerun':
    case 'translate':
    case 'fill':
    case 'setLang':
      return
  }
}

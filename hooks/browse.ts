import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import type { BrowseState, Intent, SkillId, SourceId } from '../types'

const INITIAL: BrowseState = {
  query: '', expanded: null, opened: [], shutWhileSearching: [], showingOriginal: [], inlineShowAll: false, inlineOffset: 0, showHidden: false,
}
const browse = atom({ plugin: 'skillboard', key: 'browse' } as const, INITIAL)

export function readBrowse($: EngineInterface): Promise<BrowseState> {
  return read($, browse)
}

export type BrowseChange =
  | Extract<Intent, { kind: 'search' | 'toggleGroup' | 'toggleSkill' | 'toggleOriginal' | 'toggleAll' | 'scroll' | 'toggleShowHidden' }>
  /** Showing a Recommendation's skill: open its group, expand it, drop a query that hides it. */
  | { kind: 'reveal'; skillId: SkillId; sourceId: SourceId; isHiddenByQuery: boolean }
  | { kind: 'scrollTo'; offset: number }

export function changeBrowse($: EngineInterface, change: BrowseChange): Promise<BrowseState> {
  return update($, browse, state => reduce(state, change))
}

const toggle = <T>(list: readonly T[], item: T): T[] => (list.includes(item) ? list.filter(x => x !== item) : [...list, item])
const without = <T>(list: readonly T[], item: T): T[] => list.filter(x => x !== item)

function reduce(s: BrowseState, c: BrowseChange): BrowseState {
  switch (c.kind) {
    case 'search':
      return c.query === s.query ? s : { ...s, query: c.query, shutWhileSearching: [], inlineOffset: 0 }
    case 'toggleGroup':
      return s.query.trim() !== ''
        ? { ...s, shutWhileSearching: toggle(s.shutWhileSearching, c.sourceId) }
        : { ...s, opened: toggle(s.opened, c.sourceId) }
    case 'toggleSkill':
      return { ...s, expanded: s.expanded === c.skillId ? null : c.skillId }
    case 'toggleOriginal':
      return { ...s, showingOriginal: toggle(s.showingOriginal, c.skillId) }
    case 'toggleAll':
      return { ...s, inlineShowAll: !s.inlineShowAll, inlineOffset: 0 }
    case 'scroll':
      return { ...s, inlineOffset: Math.max(0, s.inlineOffset + c.delta) }
    case 'toggleShowHidden':
      return { ...s, showHidden: !s.showHidden }
    case 'scrollTo':
      return { ...s, inlineOffset: Math.max(0, c.offset) }
    case 'reveal':
      return {
        ...s,
        expanded: c.skillId,
        opened: s.opened.includes(c.sourceId) ? s.opened : [...s.opened, c.sourceId],
        shutWhileSearching: without(s.shutWhileSearching, c.sourceId),
        inlineShowAll: true,
        query: c.isHiddenByQuery ? '' : s.query,
      }
  }
}

// Skills the person hid from the Skill Catalog and from Jev. `$.store` keeps the
// set between sessions; the atom is the copy drawings read.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import type { SkillId } from '../types'

const hidden = atom({ plugin: 'skillboard', key: 'hidden' } as const, [] as readonly SkillId[])

const STORE_KEY = 'hidden'

export function readHidden($: EngineInterface): Promise<readonly SkillId[]> {
  return read($, hidden)
}

export async function loadHidden($: EngineInterface): Promise<void> {
  const stored = await $.store.get(STORE_KEY)
  const ids = Array.isArray(stored) ? stored.filter((id): id is SkillId => typeof id === 'string') : []
  await update($, hidden, () => ids)
}

export async function setHidden($: EngineInterface, skillId: SkillId, isHidden: boolean): Promise<readonly SkillId[]> {
  const next = await update($, hidden, ids => {
    const rest = ids.filter(id => id !== skillId)
    return isHidden ? [...rest, skillId] : rest
  })
  await $.store.set(STORE_KEY, [...next])
  return next
}

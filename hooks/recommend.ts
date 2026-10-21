import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import type { RecommendationState } from '../types'

const recommendation = atom({ plugin: 'skillboard', key: 'recommendation' } as const, { kind: 'idle', ticket: 0 } as RecommendationState)

export function readRecommendation($: EngineInterface): Promise<RecommendationState> {
  return read($, recommendation)
}

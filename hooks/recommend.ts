// The Recommendation (ADR 0001): Jev alone ranks the skills. Candidate merge,
// the 255-option two-stage plan, the Jev wire format and failure mapping all
// stay inside this file.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import { compareVersions } from './catalog'
import { readHidden } from './hidden'
import type { JevFailure, RecommendationPick, RecommendationState, SkillCatalog, SkillEntry, SkillId } from '../types'

const recommendation = atom({ plugin: 'skillboard', key: 'recommendation' } as const, { kind: 'idle', ticket: 0 } as RecommendationState)

export function readRecommendation($: EngineInterface): Promise<RecommendationState> {
  return read($, recommendation)
}

const JEV_URL = 'https://api.typesafe.ai/v1/systemone'
const MAX_PROMPT_CHARS = 4000
const MAX_OPTIONS = 255
const KEEP_PER_BATCH = 10
const INSTRUCTIONS = 'Which Claude Code skill would help most with the task this prompt describes?'

/**
 * Ranks the catalog for `prompt` and stores Jev's top 3. A newer call takes a
 * higher ticket, so an older run still waiting on Jev cannot overwrite it.
 */
export async function recommend($: EngineInterface, catalog: SkillCatalog, prompt: string, jevApiKey: string): Promise<void> {
  if (jevApiKey === '' || catalog.status !== 'ready' || prompt.trim() === '') return
  let mine = 0
  await update($, recommendation, (current): RecommendationState => {
    mine = current.ticket + 1
    const previous = current.kind === 'ready' ? current.picks : current.kind === 'running' ? current.previous : []
    return { kind: 'running', ticket: mine, prompt, previous }
  })
  const candidates = mergeCandidates(catalog, await readHidden($))
  const outcome = candidates.length === 0 ? { picks: [] } : await rank($, candidates, prompt, jevApiKey)
  await update($, recommendation, (current): RecommendationState => {
    if (current.ticket !== mine) return current
    return 'failure' in outcome
      ? { kind: 'failed', ticket: mine, prompt, failure: outcome.failure }
      : { kind: 'ready', ticket: mine, prompt, picks: outcome.picks }
  })
}

/** A reload drops the closure a `running` atom was waiting on; nothing will finish it. */
export async function settleOrphanedRun($: EngineInterface): Promise<void> {
  await update($, recommendation, (current): RecommendationState => (current.kind === 'running' ? { kind: 'idle', ticket: current.ticket } : current))
}

/** After /clear the last prompt's picks no longer apply. */
export async function clearRecommendation($: EngineInterface): Promise<void> {
  await update($, recommendation, (current): RecommendationState => ({ kind: 'idle', ticket: current.ticket + 1 }))
}

/**
 * One Jev option per base name, pointing at the newest version so duplicates
 * do not split the probability. Hidden skills leave before the merge, so a
 * same-named skill from another Source still stands for the name.
 */
type Candidate = { label: string; skill: SkillEntry }

function mergeCandidates(catalog: Extract<SkillCatalog, { status: 'ready' }>, hidden: readonly SkillId[]): Candidate[] {
  const byName = new Map<string, SkillEntry>()
  for (const skill of catalog.groups.flatMap(g => g.skills).filter(s => !hidden.includes(s.id))) {
    const best = byName.get(skill.baseName)
    if (!best || compareVersions(skill.version, best.version) > 0) byName.set(skill.baseName, skill)
  }
  return [...byName.values()].map((skill, i) => ({ label: `c${i}`, skill }))
}

type Ranked = { picks: RecommendationPick[] } | { failure: JevFailure }

/** Over 255 candidates: one request scores balanced batches, a second compares the batches' leaders. */
async function rank($: EngineInterface, candidates: Candidate[], prompt: string, key: string): Promise<Ranked> {
  let finalists = candidates
  if (candidates.length > MAX_OPTIONS) {
    const count = Math.ceil(candidates.length / MAX_OPTIONS)
    const batches = Array.from({ length: count }, (_, b) => candidates.filter((_, i) => i % count === b))
    const first = await askJev($, key, prompt, batches)
    if ('failure' in first) return first
    const keep = Math.min(KEEP_PER_BATCH, Math.floor(MAX_OPTIONS / count))
    finalists = batches.flatMap((batch, b) => byProbability(batch, first.answers[b]!).slice(0, keep).map(s => s.candidate))
  }
  const final = await askJev($, key, prompt, [finalists])
  if ('failure' in final) return final
  const picks = byProbability(finalists, final.answers[0]!)
    .slice(0, 3)
    .map(s => ({ skillId: s.candidate.skill.id, probability: s.probability }))
  return { picks }
}

function byProbability(candidates: readonly Candidate[], answer: ReadonlyMap<string, number>) {
  return candidates
    .map(candidate => ({ candidate, probability: answer.get(candidate.label) ?? 0 }))
    .sort((a, b) => b.probability - a.probability)
}

type Answers = { answers: ReadonlyMap<string, number>[] } | { failure: JevFailure }

async function askJev($: EngineInterface, key: string, prompt: string, questions: readonly (readonly Candidate[])[]): Promise<Answers> {
  const body = JSON.stringify({
    model: 'jev-latest',
    state: prompt.slice(0, MAX_PROMPT_CHARS),
    questions: Object.fromEntries(
      questions.map((candidates, i) => [
        `q${i}`,
        {
          type: 'choice',
          instructions: INSTRUCTIONS,
          criteria: Object.fromEntries(
            candidates.map(c => [c.label, c.skill.description === '' ? c.skill.baseName : `${c.skill.baseName}: ${c.skill.description}`]),
          ),
        },
      ]),
    ),
  })
  let response: { status: number; ok: boolean; text: string }
  try {
    response = await $.http.fetch(JEV_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body,
    })
  } catch {
    return { failure: { kind: 'network' } }
  }
  if (response.status === 401 || response.status === 403) return { failure: { kind: 'unauthorized' } }
  if (response.status === 402 || response.status === 429) return { failure: { kind: 'quota' } }
  if (!response.ok) return { failure: { kind: 'http', status: response.status } }
  return parseAnswers(response.text, questions.length)
}

function parseAnswers(text: string, count: number): Answers {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { failure: { kind: 'malformed' } }
  }
  const answers: Map<string, number>[] = []
  for (let i = 0; i < count; i++) {
    const answer = (data as { answers?: Record<string, { probabilities?: unknown }> } | null)?.answers?.[`q${i}`]
    const probabilities = answer?.probabilities
    if (typeof probabilities !== 'object' || probabilities === null) return { failure: { kind: 'malformed' } }
    answers.push(new Map(Object.entries(probabilities).filter((e): e is [string, number] => typeof e[1] === 'number')))
  }
  return { answers }
}

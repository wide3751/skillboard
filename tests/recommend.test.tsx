import { expect, test } from 'claude-code/testing'
import type { ContextSkill } from 'claude-code'
import { CWD, HOME, PANE, SMALL, SURFACES, byName, installWorld, jevAnswer, paneProps, screen, skillMd, typed } from './world'

const JEV = { options: { jevApiKey: 'sk-test', threshold: 0.1, autoRecommend: true } }

for (const surface of SURFACES) {
  test(`without a Jev key there is no Recommendation section and no request (${surface})`, async ($, on) => {
    const rec = installWorld(on, SMALL)
    await $.session.start({ cwd: CWD, surface, isInteractive: true })
    await $.prompt.submit(typed('write tests first'))
    await rec.settle()
    const ui = await $.ui.mount({ ...PANE, surface, props: paneProps('dock') })
    const text = await screen(ui)
    expect(text).not.toContain('Recommended')
    expect(text).not.toContain('Re-suggest')
    expect(text).toContain('▸ mattpocock-skills 1.3.1 · 3')
    expect(rec.jevBodies).toHaveLength(0)
    await ui.unmount()
  })

  test(`a submitted prompt shows up to 3 picks at or above the threshold (${surface})`, JEV, async ($, on) => {
    const rec = installWorld(on, {
      ...SMALL,
      jev: jevAnswer(byName({ tdd: 0.62, grilling: 0.2, diagnose: 0.11, deploy: 0.07 })),
    })
    await $.session.start({ cwd: CWD, surface, isInteractive: true })
    await $.prompt.submit(typed('write tests first'))
    await rec.settle()
    const ui = await $.ui.mount({ ...PANE, surface, props: paneProps('dock') })
    const text = await screen(ui)
    expect(text).toContain('Recommended Re-suggest')
    const picks = text.split('\n').filter(line => / \d+%$/.test(line))
    expect(picks).toEqual(['tdd 62%', 'grilling 20%', 'diagnose 11%'])
    expect(text).toContain('mattpocock-skills 1.3.1 · +1 more Sources')
    expect(text).not.toContain('deploy 7%')
    await ui.unmount()
  })
}

test('Jev gets the prompt and one candidate per base name, the newest version standing for it', JEV, async ($, on) => {
  const rec = installWorld(on, { ...SMALL, jev: jevAnswer(byName({ tdd: 0.9 })) })
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })
  await $.prompt.submit(typed('x'.repeat(5000)))
  await rec.settle()
  expect(rec.jevUrls).toEqual(['https://api.typesafe.ai/v1/systemone'])
  expect(rec.jevHeaders[0]?.Authorization).toBe('Bearer sk-test')
  const body = rec.jevBodies[0]!
  expect(body.model).toBe('jev-latest')
  expect(body.state).toBe('x'.repeat(4000))
  const criteria = Object.values(body.questions.q0!.criteria).sort()
  expect(criteria).toEqual(['deploy: Deploys this project', 'diagnose: Diagnose hard bugs', 'grilling: Grill the user about a plan', 'tdd: Test-driven development'])

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: paneProps('dock') })
  await ui.press({ key: 'rec:plugin:mattpocock-skills|mattpocock-skills:tdd' })
  const text = await screen(ui)
  expect(text).toContain('▾ mattpocock-skills 1.3.1 · 3')
  expect(text).toContain('/mattpocock-skills:tdd · 1.3.1')
  await ui.unmount()
})

test('a pick hidden by the current search clears the search when pressed', JEV, async ($, on) => {
  const rec = installWorld(on, { ...SMALL, jev: jevAnswer(byName({ deploy: 0.8 })) })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await $.prompt.submit(typed('ship it'))
  await rec.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: paneProps('dock') })
  await ui.input({ key: 'search', text: 'grill' })
  await ui.press({ key: 'rec:project|deploy' })
  const text = await screen(ui)
  expect(text).toContain('[? Search skills]')
  expect(text).toContain('Deploys this project')
  await ui.unmount()
})

test('nothing at the threshold says no skill stands out', { options: { ...JEV.options, threshold: 0.5 } }, async ($, on) => {
  const rec = installWorld(on, { ...SMALL, jev: jevAnswer(byName({ tdd: 0.3, grilling: 0.3 })) })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await $.prompt.submit(typed('hello'))
  await rec.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: paneProps('dock') })
  const text = await screen(ui)
  expect(text).toContain('No skill stands out')
  expect(text).not.toContain('30%')
  await ui.unmount()
})

const failures = [
  { reply: { status: 401, json: {} }, line: 'Jev rejected the API key' },
  { reply: { status: 429, json: {} }, line: 'Jev quota used up' },
  { reply: { status: 500, json: {} }, line: 'Jev failed (HTTP 500)' },
  { reply: { status: 200, json: { answers: {} } }, line: 'Jev sent a reply Skillboard could not read' },
  { reply: 'network-error' as const, line: 'Could not reach Jev' },
]
for (const { reply, line } of failures) {
  test(`a Jev failure is one line and the catalog stays: ${line}`, JEV, async ($, on) => {
    const rec = installWorld(on, { ...SMALL, jev: () => reply })
    await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
    await $.prompt.submit(typed('hello'))
    await rec.settle()
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: paneProps('dock') })
    const text = await screen(ui)
    expect(text).toContain(line)
    expect(text).toContain('▸ mattpocock-skills 1.3.1 · 3')
    await ui.unmount()
  })
}

test('more than 255 candidates take two requests: batches first, then the batch leaders together', JEV, async ($, on) => {
  const many: ContextSkill[] = Array.from({ length: 300 }, (_, i) => ({ name: `s${i}`, source: 'userSettings', tokens: 1 }))
  const files = Object.fromEntries(many.map(s => [`${HOME}/.claude/skills/${s.name}/SKILL.md`, skillMd(`skill number ${s.name}`)]))
  const rec = installWorld(on, {
    files,
    usage: many,
    jev: jevAnswer(text => (text.startsWith('s7:') ? 0.5 : text.startsWith('s123:') ? 0.3 : 0.001)),
  })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await $.prompt.submit(typed('hello'))
  await rec.settle()
  expect(rec.jevBodies).toHaveLength(2)
  const [first, second] = rec.jevBodies
  const firstSizes = Object.values(first!.questions).map(q => Object.keys(q.criteria).length)
  expect(firstSizes).toEqual([150, 150])
  const finalists = Object.values(second!.questions.q0!.criteria)
  expect(Object.keys(second!.questions)).toEqual(['q0'])
  expect(finalists).toHaveLength(20)
  expect(finalists).toContain('s7: skill number s7')
  expect(finalists).toContain('s123: skill number s123')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: paneProps('dock') })
  const picks = (await screen(ui)).split('\n').filter(line => / \d+%$/.test(line))
  expect(picks).toEqual(['s7 50%', 's123 30%'])
  await ui.unmount()
})

test('a newer prompt wins over an older one still waiting on Jev', JEV, async ($, on) => {
  const rec = installWorld(on, {
    ...SMALL,
    jev: async (body, call) => {
      if (call === 1) await rec.sleep(1000)
      return jevAnswer(byName(call === 1 ? { grilling: 0.9 } : { diagnose: 0.9 }))(body)
    },
  })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await $.prompt.submit(typed('first'))
  await rec.settle()
  await $.prompt.submit(typed('second'))
  await rec.settle()
  await rec.advance(1000)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: paneProps('dock') })
  const text = await screen(ui)
  expect(text).toContain('diagnose 90%')
  expect(text).not.toContain('grilling 90%')
  await ui.unmount()
})

test('commands, hidden prompts and notifications are not sent to Jev', JEV, async ($, on) => {
  const rec = installWorld(on, { ...SMALL, jev: jevAnswer(byName({ tdd: 0.9 })) })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ ...typed('/compact'), command: { name: 'compact', args: '' } } as never)
  await $.prompt.submit({ ...typed('hidden'), isMeta: true })
  await $.prompt.submit({ text: 'task done', wait: false, origin: { kind: 'task-notification' } } as never)
  await rec.settle()
  expect(rec.jevBodies).toHaveLength(0)
  await $.prompt.submit(typed('a real prompt'))
  await rec.settle()
  expect(rec.jevBodies.map(b => b.state)).toEqual(['a real prompt'])
})

test('prompts the person sends from Desktop or Remote Control are sent to Jev', JEV, async ($, on) => {
  const rec = installWorld(on, { ...SMALL, jev: jevAnswer(byName({ tdd: 0.9 })) })
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'from desktop', wait: false, origin: { kind: 'sdk' } } as never)
  await rec.settle()
  await $.prompt.submit({ text: 'from phone', wait: false, origin: { kind: 'bridge' } } as never)
  await rec.settle()
  await $.prompt.submit({ text: 'from a peer', wait: false, origin: { kind: 'peer' } } as never)
  await rec.settle()
  expect(rec.jevBodies.map(b => b.state)).toEqual(['from desktop', 'from phone'])
})

test('with auto-recommend off only Re-suggest asks Jev, using the draft before any prompt', { options: { ...JEV.options, autoRecommend: false } }, async ($, on) => {
  const rec = installWorld(on, { ...SMALL, draft: '', jev: jevAnswer(byName({ grilling: 0.4 })) })
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: paneProps('dock') })
  await ui.press({ key: 'rerun' })
  expect(rec.jevBodies).toHaveLength(0)

  rec.setDraft('plan the migration')
  await ui.press({ key: 'rerun' })
  expect(rec.jevBodies.map(b => b.state)).toEqual(['plan the migration'])
  expect(await screen(ui)).toContain('grilling 40%')

  await $.prompt.submit(typed('another prompt'))
  await rec.settle()
  expect(rec.jevBodies).toHaveLength(1)
  await ui.press({ key: 'rerun' })
  expect(rec.jevBodies.map(b => b.state)).toEqual(['plan the migration', 'plan the migration'])
  await ui.unmount()
})

test('/clear puts the Recommendation back to waiting for a prompt', JEV, async ($, on) => {
  const rec = installWorld(on, { ...SMALL, jev: jevAnswer(byName({ tdd: 0.9 })) })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await $.prompt.submit(typed('hello'))
  await rec.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: paneProps('dock') })
  expect(await screen(ui)).toContain('tdd 90%')
  await $.session.end({ reason: 'clear', sessionId: 's', resume: {} } as never)
  expect(await screen(ui)).not.toContain('tdd 90%')
  await ui.unmount()
})

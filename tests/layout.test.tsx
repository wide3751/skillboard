import { expect, test } from 'claude-code/testing'
import type { ContextSkill } from 'claude-code'
import { CWD, HOME, PANE, SMALL, SURFACES, byName, installWorld, jevAnswer, paneProps, screen, skillMd, typed, type World } from './world'

const JEV = { options: { jevApiKey: 'sk-test' } }
const PICKS = jevAnswer(byName({ tdd: 0.62, grilling: 0.2 }))

for (const surface of SURFACES) {
  for (const placement of ['dock', 'inline'] as const) {
    test(`the pane draws on ${surface} ${placement}`, JEV, async ($, on) => {
      const rec = installWorld(on, { ...SMALL, jev: PICKS })
      await $.session.start({ cwd: CWD, surface, isInteractive: true })
      await $.prompt.submit(typed('write tests first'))
      await rec.settle()
      const ui = await $.ui.mount({ ...PANE, surface, props: paneProps(placement) })
      const lines = (await screen(ui)).split('\n')
      const hasSearch = surface !== 'mobile'
      if (placement === 'dock') {
        expect(lines).toEqual(expect.arrayContaining(['tdd 62%', '  mattpocock-skills 1.3.1 · +1 more Sources', '▸ Project 1']))
        expect(lines.some(l => l.startsWith(hasSearch ? '[? Search skills] Refresh <en>' : 'Refresh'))).toBe(true)
      } else {
        expect(lines.includes('[? Search skills]')).toBe(hasSearch)
        expect(lines).toContain('tdd 62% grilling 20%')
        expect(lines).toContain('All')
        expect(lines.some(l => l.startsWith('▸'))).toBe(false)
        expect(lines.some(l => l.includes('Refresh'))).toBe(false)
      }
      await ui.unmount()
    })
  }
}

const NINE: World = {
  files: Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => [`${HOME}/.claude/skills/k${i}/SKILL.md`, skillMd(`skill k${i}`)]),
  ),
  usage: Array.from({ length: 9 }, (_, i): ContextSkill => ({ name: `k${i}`, source: 'userSettings', tokens: 1 })),
}

for (const surface of SURFACES) {
  test(`inline 全部 opens a six-row window moved with ▲ and ▼ (${surface})`, async ($, on) => {
    const rec = installWorld(on, NINE)
    await $.session.start({ cwd: CWD, surface, isInteractive: true })
    await rec.settle()
    const ui = await $.ui.mount({ ...PANE, surface, props: paneProps('inline') })
    await ui.press({ key: 'all' })
    await ui.press({ key: 'group:user' })
    const isRow = (l: string) => l.startsWith('▾') || l.startsWith('  ·') || l.startsWith('Translate') || l === '▲' || l === '▼'
    const rows = (await screen(ui)).split('\n').filter(isRow)
    expect(rows).toEqual(['▾ User 9', 'Translate this group (9)', '  · k0', '  · k1', '  · k2', '  · k3', '▼'])

    await ui.press({ key: 'down' })
    await ui.press({ key: 'down' })
    const moved = (await screen(ui)).split('\n').filter(isRow)
    expect(moved).toEqual(['▲', '  · k0', '  · k1', '  · k2', '  · k3', '  · k4', '  · k5', '▼'])

    await ui.press({ key: 'all' })
    expect(await screen(ui)).not.toContain('k1')
    await ui.unmount()
  })
}

test('inline search shows its hits in the window without pressing 全部', async ($, on) => {
  const rec = installWorld(on, NINE)
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await rec.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: paneProps('inline') })
  await ui.input({ key: 'search', text: 'k7' })
  expect((await screen(ui)).split('\n')).toEqual(expect.arrayContaining(['▾ User 1/9', '  · k7']))
  await ui.unmount()
})

test('pressing an inline pick opens the window at that skill', JEV, async ($, on) => {
  const rec = installWorld(on, { ...NINE, jev: jevAnswer(byName({ k8: 0.7 })) })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await $.prompt.submit(typed('the eighth'))
  await rec.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: paneProps('inline') })
  await ui.press({ key: 'rec:user|k8' })
  const text = await screen(ui)
  expect(text).toContain('  ▾ k8')
  expect(text).toContain('skill k8')
  await ui.unmount()
})

const groupsButton = (text: string) => text.split('\n').find(l => /Expand all|Collapse all/.test(l))

test('全部展開 opens every group and 全部收合 shuts them, beside the language', async ($, on) => {
  const rec = installWorld(on, SMALL)
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })
  await rec.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: paneProps('dock') })
  expect(groupsButton(await screen(ui))).toBe('[? Search skills] Refresh <en> Expand all')

  await ui.press({ key: 'group:user' })
  expect(groupsButton(await screen(ui))).toContain('Expand all')
  await ui.press({ key: 'groups' })
  let text = await screen(ui)
  expect(text.split('\n').filter(l => l.startsWith('▸'))).toEqual([])
  expect(text.split('\n').filter(l => l.startsWith('▾'))).toHaveLength(3)
  expect(groupsButton(text)).toContain('Collapse all')

  await ui.press({ key: 'groups' })
  text = await screen(ui)
  expect(text.split('\n').filter(l => l.startsWith('▾'))).toEqual([])
  expect(groupsButton(text)).toContain('Expand all')
  await ui.unmount()
})

test('while searching, 全部收合 and 全部展開 act on the groups the search shows', async ($, on) => {
  const rec = installWorld(on, SMALL)
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await rec.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: paneProps('dock') })
  await ui.input({ key: 'search', text: 'tdd' })
  const headers = async () => (await screen(ui)).split('\n').filter(l => l.startsWith('▸') || l.startsWith('▾'))
  expect(await headers()).toEqual(['▾ mattpocock-skills 1.3.1 · 1/3', '▾ User 1/1'])
  expect(groupsButton(await screen(ui))).toContain('Collapse all')

  await ui.press({ key: 'groups' })
  expect(await headers()).toEqual(['▸ mattpocock-skills 1.3.1 · 1/3', '▸ User 1/1'])
  await ui.press({ key: 'group:user' })
  expect(groupsButton(await screen(ui))).toContain('Expand all')
  await ui.press({ key: 'groups' })
  expect(await headers()).toEqual(['▾ mattpocock-skills 1.3.1 · 1/3', '▾ User 1/1'])

  await ui.input({ key: 'search', text: '' })
  expect((await headers()).every(l => l.startsWith('▸'))).toBe(true)
  await ui.unmount()
})

test('inline shows 全部展開 beside 全部 only while the catalog window is open', async ($, on) => {
  const rec = installWorld(on, SMALL)
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await rec.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: paneProps('inline') })
  expect(groupsButton(await screen(ui))).toBeUndefined()
  await ui.press({ key: 'all' })
  expect((await screen(ui)).split('\n')).toContain('Hide Expand all')
  await ui.unmount()
})

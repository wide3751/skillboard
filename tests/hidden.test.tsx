import { expect, test } from 'claude-code/testing'
import { CWD, PANE, SMALL, byName, installWorld, jevAnswer, paneProps, screen, typed } from './world'

const ZH = { options: { language: 'zh-TW' } }
const ZH_JEV = { options: { language: 'zh-TW', jevApiKey: 'sk-test', threshold: 0.1, autoRecommend: true } }
const PLUGIN_TDD = 'plugin:mattpocock-skills|mattpocock-skills:tdd'

const headers = (text: string) => text.split('\n').filter(line => line.startsWith('▸') || line.startsWith('▾'))

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] } | string | null | undefined

/** Whether the row naming `name` is drawn dimmed. */
async function isDim(ui: { drawn: () => Promise<unknown> }, name: string): Promise<boolean | undefined> {
  const find = (node: Node): boolean | undefined => {
    if (node === null || node === undefined || typeof node === 'string') return undefined
    if (node.type === 'Text' && node.children?.length === 1 && node.children[0] === name) return node.props?.dimColor === true
    for (const child of node.children ?? []) {
      const found = find(child as Node)
      if (found !== undefined) return found
    }
    return undefined
  }
  return find((await ui.drawn()) as Node)
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`隱藏 takes a skill out of its group and 顯示已隱藏 brings it back dimmed (${surface})`, ZH, async ($, on) => {
    const rec = installWorld(on, SMALL)
    await $.session.start({ cwd: CWD, surface, isInteractive: true })
    await rec.settle()
    const ui = await $.ui.mount({ ...PANE, surface, props: paneProps('dock') })
    expect(await screen(ui)).not.toContain('顯示已隱藏')

    await ui.press({ key: 'group:plugin:mattpocock-skills' })
    await ui.press({ key: `skill:${PLUGIN_TDD}` })
    expect(await screen(ui)).toContain('翻譯 填入 隱藏')
    await ui.press({ key: `hide:${PLUGIN_TDD}` })
    let text = await screen(ui)
    expect(headers(text)).toContain('▾ mattpocock-skills 1.3.1 · 2')
    expect(text).not.toContain('tdd')
    expect(text.split('\n').at(-1)).toBe('顯示已隱藏（1）')

    await ui.press({ key: 'group:project' })
    await ui.press({ key: 'skill:project|deploy' })
    await ui.press({ key: 'hide:project|deploy' })
    text = await screen(ui)
    expect(text).not.toContain('專案層')
    expect(text).toContain('顯示已隱藏（2）')

    await ui.press({ key: 'showHidden' })
    text = await screen(ui)
    expect(headers(text)).toEqual(['▾ mattpocock-skills 1.3.1 · 3', '▸ 使用者層 1', '▾ 專案層 1'])
    expect(text).toContain('  · tdd')
    expect(await isDim(ui, 'tdd')).toBe(true)
    expect(await isDim(ui, 'grilling')).toBe(false)
    expect(text).toContain('收起已隱藏')

    await ui.press({ key: `skill:${PLUGIN_TDD}` })
    expect(await screen(ui)).toContain('翻譯 填入 取消隱藏')
    await ui.press({ key: `unhide:${PLUGIN_TDD}` })
    await ui.press({ key: 'skill:project|deploy' })
    await ui.press({ key: 'unhide:project|deploy' })
    await ui.press({ key: `skill:${PLUGIN_TDD}` })
    text = await screen(ui)
    expect(text).toContain('翻譯 填入 隱藏')
    expect(await isDim(ui, 'tdd')).toBe(false)
    expect(text).not.toContain('隱藏（')
    expect(text).not.toContain('收起已隱藏')

    await ui.press({ key: `hide:${PLUGIN_TDD}` })
    expect(await screen(ui)).not.toContain('tdd')
    await ui.unmount()
  })
}

test('the hidden set comes back from the store in a new session; a skill no longer listed is kept but not counted', ZH, async ($, on) => {
  const rec = installWorld(on, { ...SMALL, store: { hidden: [PLUGIN_TDD, 'user|gone'] } })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await rec.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: paneProps('dock') })
  const text = await screen(ui)
  expect(headers(text)).toContain('▸ mattpocock-skills 1.3.1 · 2')
  expect(text).toContain('顯示已隱藏（1）')

  await ui.press({ key: 'group:project' })
  await ui.press({ key: 'skill:project|deploy' })
  await ui.press({ key: 'hide:project|deploy' })
  expect(rec.store.hidden).toEqual([PLUGIN_TDD, 'user|gone', 'project|deploy'])
  await ui.unmount()
})

test('the inline window shows the toggle below its rows once 全部 opens it', ZH, async ($, on) => {
  const rec = installWorld(on, { ...SMALL, store: { hidden: ['project|deploy'] } })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await rec.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: paneProps('inline') })
  expect(await screen(ui)).not.toContain('顯示已隱藏')
  await ui.press({ key: 'all' })
  expect((await screen(ui)).split('\n').at(-1)).toBe('顯示已隱藏（1）')
  await ui.press({ key: 'showHidden' })
  expect(await screen(ui)).toContain('▸ 專案層 1')
  await ui.unmount()
})

test('search skips hidden skills unless they are shown', ZH, async ($, on) => {
  const rec = installWorld(on, { ...SMALL, store: { hidden: [PLUGIN_TDD] } })
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })
  await rec.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: paneProps('dock') })
  await ui.input({ key: 'search', text: 'tdd', kind: 'change' })
  expect(headers(await screen(ui))).toEqual(['▾ 使用者層 1/1'])
  await ui.press({ key: 'showHidden' })
  expect(headers(await screen(ui))).toEqual(['▾ mattpocock-skills 1.3.1 · 1/3', '▾ 使用者層 1/1'])
  await ui.unmount()
})

test('Jev never sees a hidden skill; a same-named skill from another Source stands in for it', ZH_JEV, async ($, on) => {
  const rec = installWorld(on, { ...SMALL, store: { hidden: [PLUGIN_TDD, 'project|deploy'] }, jev: jevAnswer(byName({ tdd: 0.9 })) })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await $.prompt.submit(typed('write tests first'))
  await rec.settle()
  const criteria = Object.values(rec.jevBodies[0]!.questions.q0!.criteria).sort()
  expect(criteria).toEqual(['diagnose: Diagnose hard bugs', 'grilling: Grill the user about a plan', 'tdd: Old TDD'])
})

test('a Recommendation pick disappears once its skill is hidden', ZH_JEV, async ($, on) => {
  const rec = installWorld(on, { ...SMALL, jev: jevAnswer(byName({ tdd: 0.9, grilling: 0.4 })) })
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })
  await $.prompt.submit(typed('write tests first'))
  await rec.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: paneProps('dock') })
  expect(await screen(ui)).toContain('tdd 90%')
  await ui.press({ key: `rec:${PLUGIN_TDD}` })
  await ui.press({ key: `hide:${PLUGIN_TDD}` })
  const text = await screen(ui)
  expect(text).not.toContain('tdd 90%')
  expect(text).toContain('grilling 40%')
  await ui.unmount()
})

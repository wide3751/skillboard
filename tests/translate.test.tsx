import { expect, test } from 'claude-code/testing'
import { CWD, HOME, PANE, SMALL, SURFACES, installWorld, paneProps, screen, typed, type Recorder } from './world'
import type { Engine } from 'claude-code/testing'

const ZH = { options: { language: 'zh-TW' } }
const FILE = `${HOME}/.claude/skillboard/translations/zh-TW.md`
const TDD = 'plugin:mattpocock-skills|mattpocock-skills:tdd'

async function openTdd($: Engine, surface: (typeof SURFACES)[number]) {
  const ui = await $.ui.mount({ ...PANE, surface, props: paneProps('dock') })
  await ui.press({ key: 'group:plugin:mattpocock-skills' })
  await ui.press({ key: `skill:${TDD}` })
  return ui
}

async function start($: Engine, rec: Recorder, surface: (typeof SURFACES)[number]) {
  await $.session.start({ cwd: CWD, surface, isInteractive: true })
  await rec.settle()
}

for (const surface of SURFACES) {
  test(`翻譯 asks Haiku once, writes the Translation File, and shows the translation (${surface})`, ZH, async ($, on) => {
    const rec = installWorld(on, { ...SMALL, haiku: () => '測試驅動開發' })
    await start($, rec, surface)
    const ui = await openTdd($, surface)
    expect(await screen(ui)).toContain('Test-driven development')
    await ui.press({ key: `translate:${TDD}` })

    expect(rec.haikuPrompts).toEqual(['Test-driven development'])
    expect(rec.writes.map(w => w.path)).toEqual([FILE])
    expect(rec.writes[0]!.text).toMatch(/^# Skillboard translations \(zh-TW\)\n[\s\S]*\n## plugin:mattpocock-skills \/ tdd\n<!-- source-hash: [0-9a-f]{8} -->\n測試驅動開發\n\n$/)
    const text = await screen(ui)
    expect(text).toContain('測試驅動開發')
    expect(text).not.toContain('翻譯 原文')
    expect(text).toContain('原文 填入')

    await ui.press({ key: `skill:${TDD}` })
    const lines = (await screen(ui)).split('\n')
    expect(lines[lines.indexOf('  · tdd') + 1]).toBe('測試驅動開發')

    await ui.press({ key: `skill:${TDD}` })
    await ui.press({ key: `original:${TDD}` })
    expect(await screen(ui)).toContain('Test-driven development')
    await ui.unmount()
  })
}

test('a saved translation is shown in a later session without asking Haiku', ZH, async ($, on) => {
  const first = installWorld(on, { ...SMALL, haiku: () => '測試驅動開發' })
  await start($, first, 'terminal')
  const ui = await openTdd($, 'terminal')
  await ui.press({ key: `translate:${TDD}` })
  await ui.unmount()
  await start($, first, 'terminal')
  const again = await $.ui.mount({ ...PANE, surface: 'terminal', props: paneProps('dock') })
  expect(await screen(again)).toContain('測試驅動開發')
  expect(first.haikuPrompts).toHaveLength(1)
  await again.unmount()
})

test('writing one section keeps the rest of the file byte for byte', ZH, async ($, on) => {
  const before = '# My notes\n\nhand written\n## plugin:mattpocock-skills / grilling\n<!-- source-hash: 00000000 -->\n我自己寫的'
  const rec = installWorld(on, { ...SMALL, files: { ...SMALL.files, [FILE]: before }, haiku: () => '測試驅動開發' })
  await start($, rec, 'desktop')
  const ui = await openTdd($, 'desktop')
  await ui.press({ key: `translate:${TDD}` })
  const after = rec.writes[0]!.text
  expect(after.startsWith(`${before}\n## plugin:mattpocock-skills / tdd\n`)).toBe(true)
  await ui.unmount()
})

test('a translation of an older original is marked outdated and can be redone', ZH, async ($, on) => {
  const stale = '## plugin:mattpocock-skills / tdd\n<!-- source-hash: deadbeef -->\n舊的譯文\n\n## user / tdd\n<!-- source-hash: 11111111 -->\n別的\n'
  const rec = installWorld(on, { ...SMALL, files: { ...SMALL.files, [FILE]: stale }, haiku: () => '新的譯文' })
  await start($, rec, 'terminal')
  const ui = await openTdd($, 'terminal')
  const text = await screen(ui)
  expect(text).toContain('舊的譯文')
  expect(text).toContain('● 已過期')
  expect(text).toContain('翻譯 原文 填入')

  await ui.press({ key: `translate:${TDD}` })
  const after = await screen(ui)
  expect(after).toContain('新的譯文')
  expect(after).not.toContain('已過期')
  expect(rec.writes[0]!.text).toMatch(/^## plugin:mattpocock-skills \/ tdd\n<!-- source-hash: [0-9a-f]{8} -->\n新的譯文\n\n## user \/ tdd\n<!-- source-hash: 11111111 -->\n別的\n$/)
  await ui.unmount()
})

test('a hand edit to the Translation File shows after the next prompt', ZH, async ($, on) => {
  const rec = installWorld(on, { ...SMALL, haiku: () => '測試驅動開發' })
  await start($, rec, 'terminal')
  const ui = await openTdd($, 'terminal')
  await ui.press({ key: `translate:${TDD}` })
  rec.edit(FILE, rec.writes[0]!.text.replace('測試驅動開發', '先寫測試再寫程式'))
  await $.prompt.submit(typed('hello'))
  await rec.settle()
  const text = await screen(ui)
  expect(text).toContain('先寫測試再寫程式')
  expect(text).not.toContain('已過期')
  await ui.unmount()
})

test('a failed translation says so, keeps the original, and writes nothing', ZH, async ($, on) => {
  const rec = installWorld(on, { ...SMALL, haiku: () => 'api-error' })
  await start($, rec, 'terminal')
  const ui = await openTdd($, 'terminal')
  await ui.press({ key: `translate:${TDD}` })
  const text = await screen(ui)
  expect(text).toContain('翻譯失敗')
  expect(text).toContain('Test-driven development')
  expect(rec.writes).toEqual([])
  await ui.unmount()
})

test('search finds a skill by its translation', ZH, async ($, on) => {
  const file = '## project / deploy\n<!-- source-hash: 00000000 -->\n部署這個專案\n'
  const rec = installWorld(on, { ...SMALL, files: { ...SMALL.files, [FILE]: file } })
  await start($, rec, 'terminal')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: paneProps('dock') })
  await ui.input({ key: 'search', text: '部署' })
  expect((await screen(ui)).split('\n').filter(l => l.startsWith('▾'))).toEqual(['▾ 專案層 1/1'])
  await ui.unmount()
})

test('an English interface can translate too: no language is special', async ($, on) => {
  const rec = installWorld(on, { ...SMALL, haiku: () => 'Test-driven development, translated' })
  await start($, rec, 'desktop')
  const ui = await openTdd($, 'desktop')
  await ui.press({ key: `translate:${TDD}` })
  expect(rec.writes.map(w => w.path)).toEqual([`${HOME}/.claude/skillboard/translations/en.md`])
  await ui.unmount()
})

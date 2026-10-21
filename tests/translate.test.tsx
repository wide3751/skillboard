import { expect, test } from 'claude-code/testing'
import type { ContextSkill } from 'claude-code'
import { CWD, HOME, PANE, SMALL, SURFACES, installWorld, paneProps, screen, skillMd, typed, type Recorder, type World } from './world'
import type { Engine } from 'claude-code/testing'
import { hashText } from '../hooks/catalog'

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

const SIX: World = {
  files: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`${HOME}/.claude/skills/k${i}/SKILL.md`, skillMd(`skill k${i}`)])),
  usage: Array.from({ length: 6 }, (_, i): ContextSkill => ({ name: `k${i}`, source: 'userSettings', tokens: 1 })),
}
const CURRENT_K0 = `## user / k0\n<!-- source-hash: ${hashText('skill k0')} -->\n技能零\n`
const batchLine = (text: string) => text.split('\n').find(l => l.startsWith('翻譯此分類') || l.startsWith('翻譯中 '))

test('翻譯此分類 translates the group three at a time and keeps every section', ZH, async ($, on) => {
  let inFlight = 0
  let most = 0
  const rec = installWorld(on, {
    ...SIX,
    files: { ...SIX.files, [FILE]: CURRENT_K0 },
    store: { hidden: ['user|k1'] },
    haiku: async prompt => {
      inFlight += 1
      most = Math.max(most, inFlight)
      await rec.sleep(1000)
      inFlight -= 1
      return `譯 ${prompt}`
    },
  })
  await start($, rec, 'terminal')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: paneProps('dock') })
  await ui.press({ key: 'group:user' })
  expect(batchLine(await screen(ui))).toBe('翻譯此分類（4）')

  await ui.press({ key: 'translateGroup:user' })
  await rec.settle()
  expect(rec.haikuPrompts).toEqual(['skill k2', 'skill k3', 'skill k4'])
  await ui.press({ key: 'translateGroup:user' })
  await rec.advance(1000)
  expect(batchLine(await screen(ui))).toBe('翻譯中 3/4')
  expect(await screen(ui)).toContain('譯 skill k2')
  await rec.advance(1000)
  await rec.settle()

  expect(rec.haikuPrompts).toEqual(['skill k2', 'skill k3', 'skill k4', 'skill k5'])
  expect(most).toBe(3)
  const final = rec.files[FILE] as string
  for (const [key, text] of [['k0', '技能零'], ['k2', '譯 skill k2'], ['k3', '譯 skill k3'], ['k4', '譯 skill k4'], ['k5', '譯 skill k5']]) {
    expect(final).toContain(`## user / ${key}\n`)
    expect(final).toContain(text)
  }
  expect(final).not.toContain('user / k1')
  expect(batchLine(await screen(ui))).toBeUndefined()
  await ui.unmount()
})

test('a failed skill leaves the group button and says how many failed', ZH, async ($, on) => {
  const rec = installWorld(on, { ...SIX, haiku: prompt => (prompt === 'skill k3' ? 'api-error' : `譯 ${prompt}`) })
  await start($, rec, 'desktop')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: paneProps('dock') })
  await ui.press({ key: 'group:user' })
  await ui.press({ key: 'translateGroup:user' })
  await rec.settle()
  const text = await screen(ui)
  expect(batchLine(text)).toBe('翻譯此分類（1）')
  expect(text).toContain('1 個翻譯失敗')
  expect(text).toContain('譯 skill k5')
  await ui.unmount()
})

test('the group button is absent when every skill is translated, inline too', ZH, async ($, on) => {
  const rec = installWorld(on, {
    files: { [`${HOME}/.claude/skills/k0/SKILL.md`]: skillMd('skill k0'), [FILE]: CURRENT_K0 },
    usage: [{ name: 'k0', source: 'userSettings', tokens: 1 }],
  })
  await start($, rec, 'terminal')
  for (const placement of ['dock', 'inline'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: paneProps(placement) })
    if (placement === 'inline') await ui.press({ key: 'all' })
    await ui.press({ key: 'group:user' })
    const text = await screen(ui)
    expect(text).toContain('k0')
    expect(batchLine(text)).toBeUndefined()
    await ui.press({ key: 'group:user' })
    await ui.unmount()
  }
})

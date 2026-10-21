import { expect, test } from 'claude-code/testing'
import { CWD, PANE, SMALL, installWorld, paneProps, screen, type World } from './world'

const cases: { name: string; option?: string; world: Partial<World>; search: string }[] = [
  { name: 'nothing set means English', world: {}, search: 'Search skills' },
  { name: 'LANG', world: { env: { LANG: 'ja_JP.UTF-8' } }, search: 'skill を検索' },
  { name: 'LC_ALL over LANG', world: { env: { LC_ALL: 'zh_CN.UTF-8', LANG: 'en_US.UTF-8' } }, search: '搜索 skill' },
  { name: 'macOS preferred language when no LANG is set', world: { appleLanguages: ['zh-Hant-TW', 'en-US'] }, search: '搜尋 skill' },
  { name: 'macOS Simplified Chinese', world: { appleLanguages: ['zh-Hans-CN'] }, search: '搜索 skill' },
  { name: 'LANG over the macOS language', world: { env: { LANG: 'ja_JP.UTF-8' }, appleLanguages: ['zh-Hant-TW'] }, search: 'skill を検索' },
  { name: 'Claude Code language setting over the environment', world: { settingsLanguage: '繁體中文', env: { LANG: 'ja_JP.UTF-8' } }, search: '搜尋 skill' },
  { name: 'the mod option over the setting', option: 'ja', world: { settingsLanguage: '繁體中文' }, search: 'skill を検索' },
  { name: 'auto falls through to detection', option: 'auto', world: { settingsLanguage: 'Traditional Chinese' }, search: '搜尋 skill' },
  { name: 'a pane choice over the option it was made under', option: 'ja', world: { store: { language: { lang: 'zh-CN', configWas: 'ja' } } }, search: '搜索 skill' },
  { name: 'a changed option over an older pane choice', option: 'en', world: { store: { language: { lang: 'zh-CN', configWas: 'ja' } } }, search: 'Search skills' },
]

for (const { name, option, world, search } of cases) {
  test(`interface language: ${name}`, option ? { options: { language: option } } : {}, async ($, on) => {
    const rec = installWorld(on, { ...SMALL, ...world })
    await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })
    await rec.settle()
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: paneProps('dock') })
    expect((await screen(ui)).split('\n')[0]!.split(']')[0]).toBe(`[? ${search}`)
    await ui.unmount()
  })
}

test('switching language in the pane relabels it and survives into the next session', async ($, on) => {
  const rec = installWorld(on, SMALL)
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await rec.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: paneProps('dock') })
  await ui.select({ key: 'lang', value: 'zh-TW' })
  const text = await screen(ui)
  expect(text).toContain('重新整理')
  expect(text).toContain('▸ 使用者層 1')
  await ui.unmount()

  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  const again = await $.ui.mount({ ...PANE, surface: 'terminal', props: paneProps('dock') })
  expect(await screen(again)).toContain('▸ 專案層 1')
  await again.unmount()
})

test('mobile, which has no Select, switches language with buttons', async ($, on) => {
  const rec = installWorld(on, SMALL)
  await $.session.start({ cwd: CWD, surface: 'mobile', isInteractive: true })
  await rec.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'mobile', props: paneProps('dock') })
  expect(await screen(ui)).not.toContain('[?')
  await ui.press({ key: 'lang:ja' })
  expect(await screen(ui)).toContain('再読み込み')
  await ui.unmount()
})

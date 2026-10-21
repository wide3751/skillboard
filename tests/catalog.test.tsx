import { expect, test } from 'claude-code/testing'
import { CWD, HOME, PANE, SURFACES, installWorld, paneProps, screen, skillMd, type World } from './world'

const INSTALLED = `${HOME}/.claude/plugins/installed_plugins.json`

const WORLD: World = {
  files: {
    [INSTALLED]: JSON.stringify({
      version: 2,
      plugins: {
        'mattpocock-skills@mattpocock': [{ scope: 'user', installPath: '/cache/mp-a/1.3.1', version: '1.3.1', lastUpdated: '2026-01-01T00:00:00Z' }],
        'mattpocock-skills@claude-plugins-official': [{ scope: 'user', installPath: '/cache/mp-b/1.3.0', version: '1.3.0' }],
        'old-thing@market': [{ scope: 'user', installPath: '/cache/old/abc1234def', version: 'abc1234def00' }],
        'disabled-plugin@market': [{ scope: 'user', installPath: '/cache/disabled/1.0.0', version: '1.0.0' }],
      },
    }),
    '/cache/mp-a/1.3.1/skills/tdd/SKILL.md': skillMd('Test-driven development with red-green-refactor'),
    '/cache/mp-a/1.3.1/skills/grilling/SKILL.md': '---\ndescription: >\n  Grill the user\n  about a plan\n---\n',
    '/cache/mp-b/1.3.0/skills/tdd/SKILL.md': skillMd('Older TDD text'),
    '/cache/old/abc1234def/.claude-plugin/plugin.json': JSON.stringify({ name: 'old-thing', skills: ['./extra'] }),
    '/cache/old/abc1234def/extra/sweep/SKILL.md': skillMd('"Sweeps the floor"'),
    [`${HOME}/.claude/skills/tdd`]: { link: '/git/mp/skills/tdd' },
    '/git/mp/skills/tdd/SKILL.md': skillMd('TDD from a git checkout'),
    '/git/mp/.claude-plugin/plugin.json': JSON.stringify({ name: 'mattpocock-skills', version: '1.2.0' }),
    [`${HOME}/.claude/skills/loose/SKILL.md`]: skillMd('A skill with no manifest above it'),
    [`${CWD}/.claude/skills/deploy/SKILL.md`]: skillMd('Deploys this project'),
  },
  enabledPlugins: {
    'mattpocock-skills@mattpocock': true,
    'mattpocock-skills@claude-plugins-official': true,
    'old-thing@market': true,
    'disabled-plugin@market': false,
  },
  usage: [
    { name: 'mattpocock-skills:tdd', source: 'plugin', pluginName: 'mattpocock-skills', tokens: 1 },
    { name: 'mattpocock-skills:grilling', source: 'plugin', pluginName: 'mattpocock-skills', tokens: 1 },
    { name: 'old-thing:sweep', source: 'plugin', pluginName: 'old-thing', tokens: 1 },
    { name: 'tdd', source: 'userSettings', tokens: 1 },
    { name: 'loose', source: 'userSettings', tokens: 1 },
    { name: 'deploy', source: 'projectSettings', tokens: 1 },
    { name: 'review', source: 'built-in', tokens: 1 },
  ],
}

for (const surface of SURFACES) {
  test(`groups the session's skills by Source with versions (${surface})`, async ($, on) => {
    const rec = installWorld(on, WORLD)
    await $.session.start({ cwd: CWD, surface, isInteractive: true })
    await rec.settle()
    const ui = await $.ui.mount({ ...PANE, surface, props: paneProps('dock') })
    const text = await screen(ui)
    const headers = text.split('\n').filter(line => line.startsWith('▸'))
    expect(headers).toEqual([
      '▸ mattpocock-skills 1.3.1 · 2',
      '▸ old-thing abc1234 · 1',
      '▸ User 2',
      '▸ Project 1',
      '▸ Built-in 1',
    ])
    expect(text).not.toContain('disabled-plugin')

    await ui.press({ key: 'group:user' })
    await ui.press({ key: 'skill:user|tdd' })
    const user = await screen(ui)
    expect(user).toContain('/tdd · 1.2.0')
    expect(user).toContain('TDD from a git checkout')
    await ui.press({ key: 'skill:user|loose' })
    expect(await screen(ui)).toContain('/loose · —')

    await ui.press({ key: 'group:plugin:mattpocock-skills' })
    await ui.press({ key: 'skill:plugin:mattpocock-skills|mattpocock-skills:tdd' })
    const plugin = await screen(ui)
    expect(plugin).toContain('/mattpocock-skills:tdd · 1.3.1')
    expect(plugin).toContain('Test-driven development with red-green-refactor')
    expect(plugin).toContain('mattpocock, claude-plugins-official')
    expect(plugin.indexOf('  · grilling')).toBeLessThan(plugin.indexOf('  ▾ tdd'))

    await ui.press({ key: 'skill:plugin:mattpocock-skills|mattpocock-skills:grilling' })
    expect(await screen(ui)).toContain('Grill the user about a plan')
    await ui.press({ key: 'group:plugin:old-thing' })
    await ui.press({ key: 'skill:plugin:old-thing|old-thing:sweep' })
    expect(await screen(ui)).toContain('Sweeps the floor')
    await ui.unmount()
  })
}

test('one row per listed skill even when two marketplaces install the plugin', async ($, on) => {
  const rec = installWorld(on, WORLD)
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })
  await rec.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: paneProps('dock') })
  await ui.press({ key: 'group:plugin:mattpocock-skills' })
  const rows = (await screen(ui)).split('\n').filter(line => line.trim().endsWith('tdd'))
  expect(rows).toEqual(['  · tdd'])
  await ui.unmount()
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`search opens groups with hits, hides the rest, and says when nothing matches (${surface})`, async ($, on) => {
    const rec = installWorld(on, WORLD)
    await $.session.start({ cwd: CWD, surface, isInteractive: true })
    await rec.settle()
    const ui = await $.ui.mount({ ...PANE, surface, props: paneProps('dock') })

    await ui.input({ key: 'search', text: 'TDD', kind: 'change' })
    const hits = (await screen(ui)).split('\n')
    expect(hits.filter(l => l.startsWith('▾') || l.startsWith('▸'))).toEqual(['▾ mattpocock-skills 1.3.1 · 1/2', '▾ User 1/2'])
    expect(hits).toContain('  · tdd')

    await ui.input({ key: 'search', text: 'deploys', kind: 'change' })
    expect((await screen(ui)).split('\n').filter(l => l.startsWith('▾'))).toEqual(['▾ Project 1/1'])

    await ui.input({ key: 'search', text: 'old-thing' })
    expect(await screen(ui)).toContain('  · sweep')

    await ui.input({ key: 'search', text: 'zzz' })
    expect(await screen(ui)).toContain('No skill matches “zzz”')

    await ui.input({ key: 'search', text: '' })
    expect((await screen(ui)).split('\n').filter(l => l.startsWith('▸'))).toHaveLength(5)
    await ui.unmount()
  })
}

test('skills typed only as /name join their group; commands and /skillboard stay out', async ($, on) => {
  const rec = installWorld(on, {
    ...WORLD,
    files: {
      ...WORLD.files,
      '/cache/mp-a/1.3.1/skills/grill-with-docs/SKILL.md': '---\ndescription: Grill against the docs\ndisable-model-invocation: true\n---\n',
      [`${HOME}/.claude/skills/grill-me/SKILL.md`]: '---\ndescription: Grill me hard\ndisable-model-invocation: true\n---\n',
      [`${CWD}/.claude/skills/ship/SKILL.md`]: skillMd('Ships this project'),
      [`${HOME}/.claude/commands/standup.md`]: 'Write a standup.',
    },
    commands: [
      { name: 'help', description: 'Show help', source: 'builtin' },
      { name: 'mattpocock-skills:tdd', description: 'TDD', source: 'plugin', plugin: 'mattpocock-skills' },
      { name: 'mattpocock-skills:grill-with-docs', description: 'Grill against the docs', source: 'plugin', plugin: 'mattpocock-skills' },
      { name: 'old-thing:lint', description: 'A plugin command', source: 'plugin', plugin: 'old-thing' },
      { name: 'grill-me', description: 'Grill me hard', source: 'user' },
      { name: 'ship', description: 'Ships this project', source: 'user' },
      { name: 'standup', description: 'Write a standup', source: 'user' },
      { name: 'server:prompt', description: 'An MCP prompt', source: 'mcp' },
    ],
  })
  await $.session.start({ cwd: CWD, surface: 'desktop', isInteractive: true })
  await rec.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: paneProps('dock') })
  expect((await screen(ui)).split('\n').filter(line => line.startsWith('▸'))).toEqual([
    '▸ mattpocock-skills 1.3.1 · 3',
    '▸ old-thing abc1234 · 1',
    '▸ User 3',
    '▸ Project 2',
    '▸ Built-in 1',
  ])
  for (const group of ['plugin:mattpocock-skills', 'plugin:old-thing', 'user', 'project', 'builtin']) await ui.press({ key: `group:${group}` })
  await ui.press({ key: 'skill:plugin:mattpocock-skills|mattpocock-skills:grill-with-docs' })
  expect(await screen(ui)).toContain('Grill against the docs')
  await ui.press({ key: 'skill:user|grill-me' })
  const text = await screen(ui)
  expect(text).toContain('Grill me hard')
  expect(text).toContain('  · ship')
  for (const absent of ['lint', 'standup', 'help', 'skillboard', 'prompt']) expect(text).not.toContain(absent)
  await ui.unmount()
})

test('the catalog shows a loading line until the listing is ready, then catches up on submit', async ($, on) => {
  const rec = installWorld(on, { ...WORLD, usage: null })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await rec.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: paneProps('dock') })
  expect(await screen(ui)).toContain('Loading skills…')

  rec.setUsage([{ name: 'deploy', source: 'projectSettings', tokens: 1 }])
  await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } })
  await rec.settle()
  expect(await screen(ui)).toContain('▸ Project 1')

  rec.setUsage([...(WORLD.usage ?? [])])
  await ui.press({ key: 'refresh' })
  expect((await screen(ui)).split('\n').filter(l => l.startsWith('▸'))).toHaveLength(5)
  await ui.unmount()
})

test('/skillboard opens the pane and closes it again, leaving no output line', async ($, on) => {
  const rec = installWorld(on, WORLD)
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  const run = () => $.command.run({ command: 'skillboard', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as never)
  expect((await run()).text).toBeUndefined()
  expect((await run()).text).toBeUndefined()
  expect(rec.opened).toEqual(['skillboard'])
  expect(rec.closed).toEqual(['skillboard'])
})

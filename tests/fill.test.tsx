import { expect, test, type Engine } from 'claude-code/testing'
import { CWD, PANE, SMALL, SURFACES, installWorld, paneProps, type World } from './world'

const TDD = 'plugin:mattpocock-skills|mattpocock-skills:tdd'

async function pressFill($: Engine, surface: (typeof SURFACES)[number]) {
  const ui = await $.ui.mount({ ...PANE, surface, props: paneProps('dock') })
  await ui.press({ key: 'group:plugin:mattpocock-skills' })
  await ui.press({ key: `skill:${TDD}` })
  await ui.press({ key: `fill:${TDD}` })
  await ui.unmount()
}

const drafts = [
  { draft: '', filled: '/mattpocock-skills:tdd ' },
  { draft: 'make the parser faster', filled: '/mattpocock-skills:tdd make the parser faster' },
  { draft: '/grilling the migration plan', filled: '/mattpocock-skills:tdd the migration plan' },
]

for (const surface of SURFACES) {
  for (const { draft, filled } of drafts) {
    test(`Fill with draft "${draft}" leaves "${filled}" unsent (${surface})`, async ($, on) => {
      const rec = installWorld(on, { ...SMALL, draft })
      await $.session.start({ cwd: CWD, surface, isInteractive: true })
      await rec.settle()
      await pressFill($, surface)
      expect(rec.draft()).toBe(filled)
      expect(rec.copies).toEqual([])
    })
  }
}

const refusals: { world: Partial<World>; toast: string; copies: string[] }[] = [
  { world: { fillRefusal: 'dialog' }, toast: 'Copied /mattpocock-skills:tdd: paste it into the prompt', copies: ['/mattpocock-skills:tdd '] },
  { world: { fillRefusal: 'no_composer', clipboard: 'no-clipboard' }, toast: 'Could not fill or copy /mattpocock-skills:tdd', copies: [] },
]
for (const { world, toast, copies } of refusals) {
  test(`a refused fill falls back to the clipboard: ${toast}`, async ($, on) => {
    const rec = installWorld(on, { ...SMALL, ...world, draft: 'keep me' })
    await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
    await rec.settle()
    await pressFill($, 'terminal')
    expect(rec.copies).toEqual(copies)
    expect(rec.toasts).toEqual([toast])
    expect(rec.draft()).toBe('keep me')
  })
}

import { expect, test } from 'claude-code/testing'
import { CWD, installWorld } from './world'

test('session start registers /skillboard and opens no pane on its own', async ($, on) => {
  const rec = installWorld(on, {})
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await rec.settle()
  expect(rec.commands).toEqual(['skillboard'])
  expect(rec.opened).toEqual([])
})

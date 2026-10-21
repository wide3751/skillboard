import type { Register } from 'claude-code'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'skillboard', description: 'Toggle the Skills Pane' })
    return next(e)
  })
}

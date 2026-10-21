// 填入: put `/name` in the prompt box without sending it.
import type { EngineInterface, RenderSurface } from 'claude-code'
import type { Say } from './i18n'

/** When the box refuses (no composer, a dialog up), the command goes to the clipboard and a toast says so. */
export async function fillSkill($: EngineInterface, name: string, surface: RenderSurface, say: Say): Promise<void> {
  const draft = (await $.prompt.read()).text
  const filled = await $.prompt.fill({ text: composeFill(draft, name), mode: 'replace' })
  if (filled.isFilled) return
  const command = `/${name} `
  const copied = await $.ui.copy({ text: command, surface })
  await $.ui.toast(copied.isCopied ? say('copied', { text: command.trim() }) : say('copyFailed', { text: command.trim() }))
}

/** An empty draft gets the command; a leading command is swapped; any other text becomes its argument. */
function composeFill(draft: string, name: string): string {
  const command = `/${name}`
  const text = draft.trimStart()
  if (text.trim() === '') return `${command} `
  const leading = /^\/\S+\s*([\s\S]*)$/.exec(text)
  return `${command} ${leading ? leading[1] : draft}`
}

// PaneModel to the surface's elements. Decides no content: only which element
// draws each model node, and what stands in where a surface lacks Input or Select.
import type { EngineInterface, Hook, RenderSurface } from 'claude-code'
import { LANG_SELECT_KEY, type Action, type DetailModel, type GroupModel, type PaneModel, type PickModel, type SkillModel } from './view'
import type { Intent, Lang } from '../types'

export type PaneEvent = Parameters<Hook<'ui.render'>>[1]
export type Dispatch = (intent: Intent, surface: RenderSurface) => void

export function paint($: EngineInterface, e: PaneEvent, model: PaneModel, dispatch: Dispatch) {
  const elements = $.ui.resolve(e)
  const { Box, Text, Button } = elements
  // The mobile table answers Input and Select with stand-ins that draw nothing, so the surface decides.
  const hasFields = e.surface !== 'mobile'
  const Input = hasFields && 'Input' in elements ? elements.Input : null
  const Select = hasFields && 'Select' in elements ? elements.Select : null

  const button = (action: Action, extra: { dimColor?: boolean } = {}) => (
    <Button key={action.key} label={action.label} {...extra} onPress={press => dispatch(action.intent, press.surface)} />
  )

  const pick = (p: PickModel, isDim: boolean) =>
    model.layout === 'inline' ? (
      <Button key={p.key} plain onPress={press => dispatch(p.intent, press.surface)}>
        {p.name} <Text dimColor>{p.percent}</Text>
      </Button>
    ) : (
      <Box flexDirection="column">
        <Button key={p.key} plain dimColor={isDim} onPress={press => dispatch(p.intent, press.surface)}>
          {p.name} <Text dimColor>{p.percent}</Text>
        </Button>
        <Text dimColor>  {p.detail}</Text>
      </Box>
    )

  const recommendation = () => {
    const r = model.recommendation
    if (r === null) return null
    const body = r.body
    const picks =
      body.kind === 'picks' ? body.picks.map(p => pick(p, false))
      : body.kind === 'running' ? body.picks.map(p => pick(p, true))
      : []
    const line =
      body.kind === 'running' ? <Text dimColor>{body.text}</Text>
      : body.kind === 'message' ? <Text dimColor>{body.text}</Text>
      : null
    return (
      <Box flexDirection="column" marginBottom={model.layout === 'dock' ? 1 : 0}>
        <Box flexDirection="row" gap={1}>
          <Text bold>{r.heading}</Text>
          {button(r.rerun, { dimColor: r.rerun.isDim })}
        </Box>
        {line}
        <Box flexDirection={model.layout === 'inline' ? 'row' : 'column'} gap={model.layout === 'inline' ? 2 : 0}>
          {picks}
        </Box>
      </Box>
    )
  }

  const toolbar = () => {
    const { search, refresh, all, language } = model.toolbar
    const onSearch = (value: string, surface: RenderSurface) => dispatch({ kind: 'search', query: value }, surface)
    return (
      <Box flexDirection="column">
        {Input && (
          <Input
            key={search.key}
            placeholder={search.placeholder}
            value={search.value}
            onInput={(value, ev) => onSearch(value, ev.surface)}
            onSubmit={(value, ev) => onSearch(value, ev.surface)}
          />
        )}
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {refresh && button(refresh)}
          {all && button(all)}
          {language && (Select ? (
            <Select
              key={LANG_SELECT_KEY}
              label={language.label}
              value={language.value}
              options={language.options.map(o => ({ value: o.lang, label: o.label }))}
              onSelect={(value, ev) => dispatch({ kind: 'setLang', lang: value as Lang }, ev.surface)}
            />
          ) : (
            language.options.map(o => button(o.action, { dimColor: o.lang !== language.value }))
          ))}
        </Box>
      </Box>
    )
  }

  const detail = (d: DetailModel) => (
    <Box flexDirection="column" paddingLeft={4}>
      <Text dimColor>{d.meta}</Text>
      {d.alsoIn && <Text dimColor>{d.alsoIn}</Text>}
      <Text>{d.text}</Text>
      {d.badge && <Text color="yellow">● {d.badge}</Text>}
      {d.status && <Text dimColor>{d.status}</Text>}
      <Box flexDirection="row" gap={1}>
        {d.translate && button(d.translate)}
        {d.toggleOriginal && button(d.toggleOriginal)}
        {button(d.fill)}
        {button(d.hide)}
      </Box>
    </Box>
  )

  const skill = (s: SkillModel) => (
    <Box flexDirection="column">
      <Button key={s.key} plain onPress={press => dispatch(s.intent, press.surface)}>
        <Text dimColor>{`  ${s.isExpanded ? '▾' : '·'} `}</Text>
        <Text bold={s.isExpanded} dimColor={s.isHidden}>{s.name}</Text>
      </Button>
      {s.detail && detail(s.detail)}
    </Box>
  )

  const groupHeader = (g: GroupModel) => (
    <Button key={g.key} plain onPress={press => dispatch(g.intent, press.surface)}>
      <Text bold color="claude">{`${g.isOpen ? '▾' : '▸'} ${g.title}`}</Text> <Text dimColor>{g.version === null ? g.count : `${g.version} · ${g.count}`}</Text>
    </Button>
  )

  const catalog = () => {
    const c = model.catalog
    switch (c.kind) {
      case 'hidden': return null
      case 'message': return <Text dimColor>{c.text}</Text>
      case 'groups':
        return (
          <Box flexDirection="column">
            {c.groups.map(g => (
              <Box flexDirection="column" marginBottom={g.isOpen ? 1 : 0}>
                {groupHeader(g)}
                {g.skills.map(skill)}
              </Box>
            ))}
          </Box>
        )
      case 'window':
        return (
          <Box flexDirection="column">
            {c.up && button(c.up)}
            {c.rows.map(row => (row.row === 'group' ? groupHeader(row) : skill(row)))}
            {c.down && button(c.down)}
          </Box>
        )
    }
  }

  return (
    <Box flexDirection="column">
      {recommendation()}
      {toolbar()}
      {catalog()}
      {model.showHidden && button(model.showHidden, { dimColor: true })}
    </Box>
  )
}

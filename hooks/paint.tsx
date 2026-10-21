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

  const button = (action: Action, extra: { dimColor?: boolean; variant?: 'primary' | 'secondary' } = {}) => (
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
          {p.name} <Text color="success" bold>{p.percent}</Text>
        </Button>
        <Text dimColor wrap="truncate-end">  {p.detail}</Text>
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
    const heading = (
      <Box flexDirection="row" gap={1}>
        <Text bold color={model.layout === 'dock' ? 'claude' : undefined}>{r.heading}</Text>
        {button(r.rerun, { dimColor: r.rerun.isDim })}
      </Box>
    )
    if (model.layout === 'inline') {
      return (
        <Box flexDirection="column">
          {heading}
          {line}
          <Box flexDirection="row" gap={2}>{picks}</Box>
        </Box>
      )
    }
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1} marginBottom={1}>
        {heading}
        {line}
        <Box flexDirection="column">{picks}</Box>
      </Box>
    )
  }

  const toolbar = () => {
    const { search, refresh, all, language } = model.toolbar
    const onSearch = (value: string, surface: RenderSurface) => dispatch({ kind: 'search', query: value }, surface)
    const input = Input && (
      <Input
        key={search.key}
        placeholder={search.placeholder}
        value={search.value}
        onInput={(value, ev) => onSearch(value, ev.surface)}
        onSubmit={(value, ev) => onSearch(value, ev.surface)}
      />
    )
    const controls = [
      refresh && button(refresh),
      all && button(all),
      language && (Select ? (
        <Select
          key={LANG_SELECT_KEY}
          label={language.label}
          value={language.value}
          options={language.options.map(o => ({ value: o.lang, label: o.label }))}
          onSelect={(value, ev) => dispatch({ kind: 'setLang', lang: value as Lang }, ev.surface)}
        />
      ) : (
        language.options.map(o => button(o.action, { dimColor: o.lang !== language.value }))
      )),
    ]
    if (model.layout === 'dock') {
      return (
        <Box flexDirection="row" gap={1} flexWrap="wrap" alignItems="center" marginBottom={1}>
          {input && <Box flexGrow={1} minWidth={20}>{input}</Box>}
          {controls}
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        {input}
        <Box flexDirection="row" gap={1} flexWrap="wrap">{controls}</Box>
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
        {d.translate && button(d.translate, { variant: 'secondary' })}
        {d.toggleOriginal && button(d.toggleOriginal, { variant: 'secondary' })}
        {button(d.fill, { variant: 'primary' })}
        {button(d.hide, { variant: 'secondary' })}
      </Box>
    </Box>
  )

  const skill = (s: SkillModel) => (
    <Box flexDirection="column">
      <Button key={s.key} plain onPress={press => dispatch(s.intent, press.surface)}>
        <Text dimColor>{`  ${s.isExpanded ? '▾' : '·'} `}</Text>
        <Text bold={s.isExpanded} dimColor={s.isHidden}>{s.name}</Text>
      </Button>
      {s.summary && (
        <Box paddingLeft={4}>
          <Text dimColor wrap="truncate-end">{s.summary}</Text>
        </Box>
      )}
      {s.detail && detail(s.detail)}
    </Box>
  )

  const groupHeader = (g: GroupModel) => (
    <Box flexDirection="row" justifyContent="space-between">
      <Button
        key={g.key}
        variant="secondary"
        label={`${g.isOpen ? '▾' : '▸'} ${g.title}`}
        onPress={press => dispatch(g.intent, press.surface)}
      />
      <Text dimColor>{g.version === null ? g.count : `${g.version} · ${g.count}`}</Text>
    </Box>
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

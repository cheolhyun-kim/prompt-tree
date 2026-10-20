import type { ClientModule } from 'claude-code'

import type { ViewRow } from '../types'

// 패널의 분기 그래프. 노드 줄을 마우스로 끌어 다른 노드 줄에 놓으면 그 노드 밑으로 옮긴다.
// 끄는 동안 끈 줄은 반전, 놓을 줄은 주황으로 칠한다. 끌지 않고 떼면 그냥 클릭(노드 상세 열기).
type Props = { rows: ViewRow[] }
type State = { drag: { from: number; over: number } | null; phase: number }

const CRAIL = '#d97757'
const IVORY = '#faf9f5'
// 현재 위치 원: 0.6초 켜짐(주황) / 0.6초 꺼짐(공백)으로 또렷하게 깜빡인다.
const FRAME_MS = 600
const PULSE = [CRAIL, null]
const started = new WeakSet<object>()

const GraphView: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const rows = props.rows
  const drag = surface.state?.drag ?? null
  const phase = surface.state?.phase ?? 0
  if (!started.has(surface)) {
    started.add(surface)
    surface.every(FRAME_MS, () => {
      const s = surface.state
      surface.setState({ drag: s?.drag ?? null, phase: ((s?.phase ?? 0) + 1) % PULSE.length })
    })
  }
  const isMoving = drag !== null && drag.from !== drag.over

  // 매번 다시 걸어 최신 rows를 본다(나중 호출이 앞의 것을 바꾼다).
  surface.onPointer(e => {
    const now = surface.state?.drag ?? null
    const y = Math.max(0, Math.min(rows.length - 1, e.y))
    if (e.type === 'down' && e.button === 'left' && e.y >= 0 && e.y < rows.length) {
      surface.setState({ drag: { from: e.y, over: e.y }, phase: surface.state?.phase ?? 0 })
    } else if (e.type === 'move' && now !== null && y !== now.over) {
      surface.setState({ drag: { ...now, over: y }, phase: surface.state?.phase ?? 0 })
    } else if (e.type === 'up' && now !== null) {
      surface.setState({ drag: null, phase: surface.state?.phase ?? 0 })
      const from = rows[now.from]
      const to = rows[y]
      if (from === undefined || to === undefined) return
      surface.post(from.id === to.id ? { select: from.id } : { move: from.id, to: to.id })
    }
  })

  return (
    <Box flexDirection="column">
      {rows.map((r, y) => {
        const isFrom = isMoving && drag.from === y
        const isTarget = isMoving && drag.over === y
        return (
          <Text wrap="truncate-end">
            {r.runs.map(run => (
              <Text color={run.pulse ? (PULSE[phase] ?? undefined) : run.color} bold={run.bold}>
                {run.pulse && PULSE[phase] === null ? ' ' : run.ch}
              </Text>
            ))}
            <Text> </Text>
            <Text
              bold={r.bold || isTarget}
              color={isTarget ? IVORY : r.color || undefined}
              backgroundColor={isTarget ? CRAIL : undefined}
              dimColor={r.dim && !isTarget}
              italic={r.italic}
              inverse={isFrom}
            >
              {r.title}
            </Text>
            {isTarget && <Text color={CRAIL}> ⤷ 여기 밑으로</Text>}
          </Text>
        )
      })}
    </Box>
  )
}

export default GraphView

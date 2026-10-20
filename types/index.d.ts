// step: 중요한 프롬프트·답변 기록 / todo: 아직 안 간 분기 / doing: 진행 중 분기 / done: 끝난 분기
export type NodeStatus = 'step' | 'todo' | 'doing' | 'done'

export type TreeNode = {
  id: string
  parent: string | null
  title: string
  note: string
  status: NodeStatus
  at: number
  // 노드를 만든 턴의 사용자 프롬프트 행 id. 이 기능 전에 만든 노드에는 없다.
  row?: string
  // 부모의 줄기를 잇지 않고 늘 새 갈래로 그린다(부모 위로 끌어다 놓아 갈라낸 노드).
  fork?: boolean
  // 그릴 때만 만드는 묶음 머리 노드: closed = 접힘(멤버 대신 한 줄), open = 펼침(멤버 위 머리)
  group?: 'open' | 'closed'
  // 그릴 때만: 펼친 묶음 안의 노드면 그 묶음 id (회색으로 그려 묶음 안임을 표시)
  inGroup?: string
}

// 오래된 연속 노드 묶음. members는 이어진 한 덩어리(뿌리 하나)여야 한다. 원래 노드는 그대로 둔다.
export type Group = { id: string; title: string; note: string; members: string[]; collapsed: boolean }

export type Tree = { nodes: TreeNode[]; current: string | null; seq: number; groups?: Group[] }

// 사용자가 답변에서 드래그해 저장한 부분. node = 저장할 때의 현재 트리 노드,
// row = 드래그한 대화 행의 id(여러 행에 걸쳐 드래그하면 없음)
export type Bookmark = { id: string; text: string; node: string | null; at: number; row?: string }

// 패널 그래프 한 줄: 드래그 화면 모듈(graph-view)이 그대로 그린다. color ''는 기본색.
// pulse: 현재 위치를 나타내는 주황 원. 화면 모듈이 부드럽게 깜빡이게 그린다.
export type ViewRun = { ch: string; color: string; bold: boolean; pulse: boolean }
export type ViewRow = {
  id: string
  runs: ViewRun[]
  title: string
  color: string
  bold: boolean
  dim: boolean
  italic: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-tree': {
      tree: Tree
      selected: string | null
      marks: Bookmark[]
      openMark: string | null
      lastMark: string | null
      bandNote: string | null
      highlight: { row: string; text: string } | null
      lastPrompt: string | null
      paneOpen: boolean | null
    }
  }
}

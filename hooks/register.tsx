import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Bookmark, Group, NodeStatus, Tree, TreeNode, ViewRow } from '../types'

const PANE = 'prompt-tree'
const TOOL = 'mcp__prompt-tree__tree'
const EMPTY: Tree = { nodes: [], current: null, seq: 0 }

const tree = atom({ plugin: 'prompt-tree', key: 'tree' } as const, EMPTY)
const selected = atom({ plugin: 'prompt-tree', key: 'selected' } as const, null)
const marks = atom({ plugin: 'prompt-tree', key: 'marks' } as const, [] as Bookmark[])
const openMark = atom({ plugin: 'prompt-tree', key: 'openMark' } as const, null)
// 방금 저장한 북마크: 입력창 위 띠에 [취소]를 띄운다. 다음 프롬프트를 보내면 지운다.
const lastMark = atom({ plugin: 'prompt-tree', key: 'lastMark' } as const, null)
const bandNote = atom({ plugin: 'prompt-tree', key: 'bandNote' } as const, null)
// [위치로 이동]으로 간 북마크: 그 답변 행에서 북마크한 줄을 형광펜처럼 칠한다.
const highlight = atom({ plugin: 'prompt-tree', key: 'highlight' } as const, null as { row: string; text: string } | null)
// Claude 팔레트: Crail 주황, 거의 검정, 미색, 중간 회색. 파랑은 쓰지 않는다.
const CRAIL = '#d97757'
const INK = '#141413'
const IVORY = '#faf9f5'
const GRAY = '#b0aea5'
const MARKER = '#f2c9b8'
// 가장 최근 사용자 프롬프트의 대화 행 id. 노드를 만들 때 그 노드의 위치로 남긴다.
// 패널이 열려 있는지(입력창 위 Tree 버튼이 열기/닫기를 고른다). null = 아직 모름 → 처음엔 연다.
const paneOpen = atom({ plugin: 'prompt-tree', key: 'paneOpen' } as const, null as boolean | null)
const lastPrompt = atom({ plugin: 'prompt-tree', key: 'lastPrompt' } as const, null as string | null)

const MARK: Record<NodeStatus, string> = { step: '•', todo: '○', doing: '◐', done: '✓' }

// 모델에게 주는 고정 안내. 매 턴 바뀌지 않게 둬서 프롬프트 캐시를 깨지 않는다.
const GUIDE = `# prompt-tree
화면 오른쪽에 대화의 분기 트리가 있다. 도구 ${TOOL}로 관리한다. 모든 턴마다 쓰지 말고 아래 경우에만 쓴다.
- add: 결정·결과·방향 전환처럼 나중에 다시 찾아볼 만한 프롬프트와 답변. 현재 노드의 자식이 되고 현재 노드가 된다.
- branch: 내가 여러 갈래(A, B, C처럼 따로 진행할 작업)를 제안했을 때. 각 갈래를 todo 노드로 현재 노드 밑에 단다.
- switch: 사용자가 어느 갈래(또는 이전 노드)로 가기로 했을 때. 그 노드가 현재 노드가 되고 todo면 doing이 된다.
- done: 갈래 작업이 끝났을 때. 끝낸 뒤 남은 todo 갈래가 있으면 사용자에게 알려 준다.
- edit: 잘못 붙은 노드를 parent로 옮기거나 title·note를 고친다.
- group: 노드가 많이 쌓이면 가끔, 이미 끝난 오래된 연속 노드들(ids, 이어진 한 덩어리)을 하나의 큰 작업으로 묶는다. title·note는 묶음 전체 요약. 묶음은 접힌 ◎ 한 줄로 보이고 사용자가 누르면 펼쳐진다. 최근 작업이나 진행 중·대기 갈래는 묶지 않는다.
- ungroup: id(g로 시작)의 묶음을 푼다.
- view: 트리 전체를 글로 본다.
title은 20자 안팎의 짧은 한국어.
note는 사용자가 패널에서 바로 읽는 글이다. 며칠 뒤 봐도 바로 이해되게, 쉬운 문장으로 짧게 쓴다. 코드 이름·함수명·색 코드 같은 구현 용어는 꼭 필요할 때만 쓴다. 형식:
요청: 사용자가 무엇을 하라고 했는지 (또는 내가 어떤 이유로 무엇을 제안했는지)
한 일: 그래서 무엇을 했는지, 결과는 어땠는지
남은 일: 아직 안 된 것, 확인할 것 (없으면 이 줄은 뺀다)
예) 요청: 북마크로 이동하면 그 부분을 형광펜처럼 칠해 달라고 함 / 한 일: 이동한 답변의 해당 줄을 노랗게 칠함. 아무 데나 클릭해 지우는 기능은 지원이 안 돼서 형광펜을 누르거나 입력창에 타자를 치면 지워지게 함 / 남은 일: 실제 화면에서 칠해지는지 확인
사용자 프롬프트가 "[트리 n12]"로 시작하면 사용자가 트리에서 그 노드를 골라 돌아온 것이다. 먼저 switch를 부르고 note를 바탕으로 이어 간다.`

type Args = {
  action?: 'add' | 'branch' | 'switch' | 'done' | 'edit' | 'group' | 'ungroup' | 'view'
  ids?: string[]
  parent?: string
  title?: string
  note?: string
  id?: string
  options?: { title?: string; note?: string }[]
}

// 부모에 자식이 둘 이상일 때만 들여쓴다. 일직선으로 이어지는 기록은 같은 칸에 쌓여 아래로만 자란다.
function layout(t: Tree): { node: TreeNode; depth: number }[] {
  const kids = new Map<string | null, TreeNode[]>()
  for (const n of t.nodes) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n])
  const out: { node: TreeNode; depth: number }[] = []
  const walk = (id: string | null, depth: number) => {
    const list = kids.get(id) ?? []
    const d = list.length > 1 ? depth + 1 : depth
    for (const c of list) {
      out.push({ node: c, depth: d })
      walk(c.id, d)
    }
  }
  walk(null, 0)
  return out
}

function asText(t: Tree): string {
  if (t.nodes.length === 0) return '(트리가 비어 있음)'
  const lines = layout(t).map(({ node, depth }) => {
    const here = node.id === t.current ? ' ← 현재' : ''
    return `${'  '.repeat(depth)}${MARK[node.status]} [${node.id}] ${node.title}${here}`
  })
  const todo = t.nodes.filter(n => n.status === 'todo').map(n => `${n.id} ${n.title}`)
  const groups = (t.groups ?? []).map(g => `묶음 [${g.id}] ${g.title}: ${g.members.join(', ')}`)
  return [...lines, '', ...groups, `남은 todo 갈래: ${todo.length === 0 ? '없음' : todo.join(', ')}`].join('\n')
}

// 패널용 git 그래프. 행 = 노드 생성 순서(아래로 자람). 부모의 첫 자식은 부모 레인을 잇고,
// 다른 자식은 부모 행에서 새 레인으로 갈라진다(╮). 레인은 열린 동안 │로 이어지고 끝나면 다시 쓴다.
// 갈래 색: Crail과 회색을 번갈아 쓰고, 밝기를 달리해 구분한다.
const LANE_COLORS = [CRAIL, GRAY, '#e9a487', '#8c8a82', '#b5583a', '#d6d3c9', '#f0c2ad', '#6f6d66']
const DOT: Record<NodeStatus, string> = { step: '●', todo: '○', doing: '◉', done: '●' }

// 묶음을 그릴 모양으로 바꾼다. 접힌 묶음은 멤버를 ◎ 한 줄로 대신하고(멤버의 자식은 ◎에 붙임),
// 펼친 묶음은 ◎ 머리를 맨 앞 멤버 위에 끼운다. 원래 트리는 건드리지 않는다.
export function display(t: Tree): Tree {
  let nodes = t.nodes
  let current = t.current
  for (const g of t.groups ?? []) {
    const members = new Set(g.members)
    const inside = nodes.filter(n => members.has(n.id))
    const root = inside.find(n => n.parent === null || !members.has(n.parent))
    if (root === undefined) continue
    const head: TreeNode = {
      id: g.id,
      parent: root.parent,
      title: g.collapsed ? `${g.title} (${inside.length}) ▸` : `${g.title} ▾`,
      note: g.note,
      status: 'step',
      at: root.at,
      group: g.collapsed ? 'closed' : 'open',
    }
    if (g.collapsed) {
      const at = nodes.slice(0, nodes.indexOf(root)).filter(n => !members.has(n.id)).length
      nodes = nodes
        .filter(n => !members.has(n.id))
        .map(n => (n.parent !== null && members.has(n.parent) ? { ...n, parent: g.id } : n))
      nodes.splice(at, 0, head)
      if (current !== null && members.has(current)) current = g.id
    } else {
      nodes = nodes.map(n =>
        members.has(n.id) ? { ...n, inGroup: g.id, parent: n.id === root.id ? g.id : n.parent } : n,
      )
      nodes.splice(nodes.findIndex(n => n.id === root.id), 0, head)
    }
  }
  return { ...t, nodes, current }
}

// ids가 이어진 한 덩어리(뿌리 하나)인지
function isConnected(t: Tree, ids: string[]): boolean {
  const set = new Set(ids)
  const roots = t.nodes.filter(n => set.has(n.id) && (n.parent === null || !set.has(n.parent)))
  return roots.length === 1
}

// 노드를 옮기면 그 노드가 든 묶음은 이어짐이 깨질 수 있으니 푼다.
function dropGroupsOf(t: Tree, id: string): Tree {
  return { ...t, groups: (t.groups ?? []).filter(g => !g.members.includes(id)) }
}

export type GraphCell = { ch: string; lane: number }
export type GraphRow = { node: TreeNode; lane: number; cells: GraphCell[] }

export function graph(t: Tree): GraphRow[] {
  const nodes = t.nodes
  const rowOf = new Map(nodes.map((n, i) => [n.id, i]))
  const chainOf = new Map<string, number>()
  const chains: {
    start: number
    end: number
    from: number | null
    up: number | null
    rows: Set<number>
    lane: number
  }[] = []
  const continued = new Set<string>()
  nodes.forEach((n, i) => {
    const p = n.parent !== null && rowOf.has(n.parent) ? n.parent : null
    if (p !== null && !continued.has(p) && n.fork !== true) {
      continued.add(p)
      const c = chains[chainOf.get(p)!]!
      c.end = i
      c.rows.add(i)
      chainOf.set(n.id, chainOf.get(p)!)
      return
    }
    const from = p === null ? null : rowOf.get(p)!
    chains.push({ start: from ?? i, end: i, from, up: p === null ? null : chainOf.get(p)!, rows: new Set([i]), lane: 0 })
    chainOf.set(n.id, chains.length - 1)
  })
  const laneEnd: number[] = []
  // 갈래는 항상 부모 레인보다 오른쪽에 둔다(갈래의 갈래는 더 오른쪽으로).
  for (const c of [...chains].sort((a, b) => a.start - b.start)) {
    const min = c.up === null ? 0 : chains[c.up]!.lane + 1
    let lane = laneEnd.findIndex((end, l) => l >= min && end < c.start)
    if (lane < 0) lane = Math.max(min, laneEnd.length)
    laneEnd[lane] = c.end
    c.lane = lane
  }
  const width = laneEnd.length * 2
  return nodes.map((node, r) => {
    const cells: GraphCell[] = Array.from({ length: width }, () => ({ ch: ' ', lane: 0 }))
    for (const c of chains) {
      if (r > c.start && r < c.end && !c.rows.has(r)) cells[c.lane * 2] = { ch: '│', lane: c.lane }
    }
    const lane = chains[chainOf.get(node.id)!]!.lane
    // 이 행에서 갈라지는 레인들: 먼 쪽부터 가로줄을 그리고, 중간에 갈라지는 레인은 ┬, 끝은 ╮/╭.
    const forks = chains.filter(c => c.from === r).sort((a, b) => Math.abs(b.lane - lane) - Math.abs(a.lane - lane))
    for (const c of forks) {
      const [lo, hi] = lane < c.lane ? [lane, c.lane] : [c.lane, lane]
      for (let x = lo * 2 + 1; x < hi * 2; x++) {
        const was = cells[x]!.ch
        if (was === ' ' || was === '│') cells[x] = { ch: was === '│' ? '┼' : '─', lane: c.lane }
      }
      const end = cells[c.lane * 2]!.ch
      cells[c.lane * 2] = { ch: end === '─' || end === '┼' ? '┬' : c.lane > lane ? '╮' : '╭', lane: c.lane }
    }
    cells[lane * 2] = { ch: node.group !== undefined ? '◎' : DOT[node.status], lane }
    return { node, lane, cells }
  })
}

// 메모의 '요청: / 한 일: / 남은 일: / 완료:' 줄을 나눠 칸마다 색을 입힌다.
const NOTE_LABELS = [
  { re: /^요청\s*:\s*/, label: '요청', color: CRAIL },
  { re: /^한\s*일\s*:\s*/, label: '한 일', color: CRAIL },
  { re: /^남은\s*일\s*:\s*/, label: '남은 일', color: CRAIL },
  { re: /^완료\s*:\s*/, label: '완료', color: CRAIL },
] as const

export type NotePart = { label: string | null; color: string | null; text: string }

export function noteParts(note: string): NotePart[] {
  return note
    .split(/\n| \/ (?=(?:요청|한\s*일|남은\s*일|완료)\s*:)/)
    .map(line => line.trim())
    .filter(line => line !== '')
    .map(line => {
      const hit = NOTE_LABELS.find(l => l.re.test(line))
      return hit === undefined
        ? { label: null, color: null, text: line }
        : { label: hit.label, color: hit.color, text: line.replace(hit.re, '') }
    })
}

const STATUS_TEXT: Record<NodeStatus, string> = { step: '기록', todo: '대기', doing: '진행 중', done: '완료' }

// 터미널 칸 수: 한글·한자 등 넓은 글자는 2칸.
function cellWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    const isWide =
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe4f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6)
    w += isWide ? 2 : 1
  }
  return w
}

function cut(s: string, room: number): string {
  if (cellWidth(s) <= room) return s
  let out = ''
  for (const ch of s) {
    if (cellWidth(out + ch) > Math.max(1, room - 1)) break
    out += ch
  }
  return out + '…'
}

// 세션마다 따로 둔다. --resume로 같은 세션을 다시 열어도 남도록 $.store에 세션 id로 저장한다. reload 때 session.start가 다시 채운다.
let storeKey = 'tree'
let markKey = 'marks'

async function change($: EngineInterface, fn: (t: Tree) => Tree) {
  const saved = await update($, tree, fn)
  await $.store.set(storeKey, saved)
  return saved
}

// target이 id 자신이거나 id의 자손이면 true (그 밑으로 옮기면 고리가 생긴다).
function isUnder(t: Tree, target: string, id: string): boolean {
  for (let p: string | null = target; p !== null; p = t.nodes.find(n => n.id === p)?.parent ?? null) {
    if (p === id) return true
  }
  return false
}

// 그래프에서 노드를 끌어 다른 노드에 놓으면, 끈 노드를 놓은 노드의 자식으로 붙인다(새 갈래가 된다).
async function moveNode($: EngineInterface, id: string, target: string) {
  const t = await read($, tree)
  const node = t.nodes.find(n => n.id === id)
  if (node === undefined || !t.nodes.some(n => n.id === target)) {
    $.ui.toast('묶음(◎)은 끌거나 그 위에 놓을 수 없습니다. 눌러서 펼친 뒤 안의 노드로 하세요.')
    return
  }
  // 자기 부모 위에 놓으면: 그 자리에서 갈라낸다(새 갈래 + 부모는 대기 ○). 한 번 더 놓으면 되돌린다.
  if (node !== undefined && target === node.parent) {
    const isFork = node.fork !== true
    await change($, t => ({
      ...t,
      nodes: t.nodes.map(n =>
        n.id === id
          ? { ...n, fork: isFork }
          : n.id === target && isFork && n.status !== 'done'
            ? { ...n, status: 'todo' }
            : n.id === target && !isFork && n.status === 'todo'
              ? { ...n, status: 'step' }
              : n,
      ),
    }))
    return
  }
  if (isUnder(t, target, id)) {
    $.ui.toast('자기 자신이나 자기 밑의 노드로는 옮길 수 없습니다.')
    return
  }
  await change($, t =>
    dropGroupsOf({ ...t, nodes: t.nodes.map(n => (n.id === id ? { ...n, parent: target, fork: false } : n)) }, id),
  )
}

// 그래프 줄을 누르면: 묶음(◎)은 접기/펼치기, 노드는 상세 열기
async function pickRow($: EngineInterface, id: string) {
  if (((await read($, tree)).groups ?? []).some(g => g.id === id)) {
    await change($, t => ({
      ...t,
      groups: (t.groups ?? []).map(g => (g.id === id ? { ...g, collapsed: !g.collapsed } : g)),
    }))
  } else {
    // 이미 열린 노드를 다시 누르면 닫는다.
    await update($, selected, v => (v === id ? null : id))
  }
}

// 그래프 행을 그릴 값으로 바꾼다. 같은 색이 이어지는 칸은 하나로 묶는다.
// 현재 노드는 노드 칸을 주황 원(깜빡임)으로, 상세가 열린 노드는 제목을 주황으로 표시한다.
function viewRows(t: Tree, rows: GraphRow[], width: number, open: string | null): ViewRow[] {
  return rows.map(({ node, lane, cells }) => {
    const isHere = node.id === t.current
    // 펼친 묶음 안의 노드는 원과 제목을 Claude 회색으로 그려 묶음 안임을 표시한다.
    const isMember = node.inGroup !== undefined
    const runs: (GraphCell & { pulse: boolean; own: boolean })[] = []
    cells.forEach((c, x) => {
      const own = x === lane * 2 && (isHere || isMember)
      const pulse = isHere && x === lane * 2
      const last = runs[runs.length - 1]
      if (last !== undefined && last.lane === c.lane && !last.own && !own) last.ch += c.ch
      else runs.push({ ...c, ch: pulse && c.ch !== '◎' ? '●' : c.ch, pulse, own })
    })
    return {
      id: node.id,
      runs: runs.map(r => ({
        ch: r.ch,
        color: r.pulse ? CRAIL : r.own && isMember ? GRAY : LANE_COLORS[r.lane % LANE_COLORS.length]!,
        bold: r.pulse || r.ch.includes('◉'),
        pulse: r.pulse,
      })),
      title: cut(node.title, width - cells.length - 4) + (node.status === 'done' ? ' ✓' : ''),
      color: node.id === open ? CRAIL : isMember ? GRAY : '',
      bold: node.id === open,
      dim: node.status === 'done' && node.id !== open,
      italic: node.status === 'todo',
    }
  })
}

async function toggleTree($: EngineInterface) {
  if ((await read($, paneOpen)) === true) {
    await $.ui.close({ id: PANE })
    await update($, paneOpen, () => false)
  } else {
    await $.ui.open({ id: PANE, title: '분기 트리' })
    await update($, paneOpen, () => true)
  }
}

async function askFrom($: EngineInterface, id: string) {
  const t = await change($, t => ({
    ...t,
    current: id,
    nodes: t.nodes.map(n => (n.id === id && n.status === 'todo' ? { ...n, status: 'doing' } : n)),
  }))
  const node = t.nodes.find(n => n.id === id)
  await update($, selected, () => null)
  if (node !== undefined) {
    await $.prompt.fill({ text: `[트리 ${node.id}] "${node.title}"(으)로 돌아가서 이어서 하자.\n맥락: ${node.note}\n` })
  }
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

// 전체화면 터미널에서 마우스로 드래그한 글을 북마크로 저장한다.
async function addMark($: EngineInterface) {
  const sel = await $.ui.selection()
  const text = sel?.text.trim() ?? ''
  if (text === '') {
    await update($, bandNote, () => '먼저 답변에서 저장할 부분을 드래그하세요')
    return
  }
  const at = await $.clock.now()
  const id = `b${at}`
  const node = (await read($, tree)).current
  const list = await update($, marks, l => [...l, { id, text, node, at, row: sel?.requestId }])
  await $.store.set(markKey, list)
  await update($, lastMark, () => id)
  await update($, bandNote, () => null)
}

// 화면에 그려진 글(드래그 복사본)과 원래 마크다운 줄을 비교하려고 기호·목록 표시·공백을 걷어 낸다.
function plain(s: string): string {
  return s
    .replace(/^\s*([-+*•●⏺◦▪]|\d+\.)\s+/, '')
    .replace(/[*_`#>|~\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// 북마크 글이 마크다운의 몇째 줄부터 몇째 줄까지인지 찾는다. 못 찾으면 블록 전체.
export function markedLines(md: string, sel: string): [number, number] {
  const lines = md.split('\n').map(plain)
  const want = sel.split('\n').map(plain).filter(w => w !== '')
  const all: [number, number] = [0, lines.length - 1]
  if (want.length === 0) return all
  const find = (probe: string, from: number) => lines.findIndex((l, i) => i >= from && l !== '' && l.includes(probe))
  const start = find(want[0]!.slice(0, 24), 0)
  if (start < 0) return all
  const end = find(want[want.length - 1]!.slice(-24), start)
  return [start, end < 0 ? Math.min(lines.length - 1, start + want.length - 1) : end]
}

// 북마크한 답변 행으로 대화 화면을 스크롤한다. 사람이 누른 버튼에서만 움직인다.
async function jumpTo($: EngineInterface, row: string, text: string) {
  await update($, highlight, () => ({ row, text }))
  const moved = await $.ui.scroll({ to: { requestId: row }, block: 'start' })
  if (moved.deny !== undefined) $.ui.toast(`북마크 위치로 이동하지 못했습니다: ${moved.deny}`)
}

// 노드를 만든 턴의 프롬프트로 대화 화면을 스크롤한다.
async function jumpToNode($: EngineInterface, row: string) {
  const moved = await $.ui.scroll({ to: { requestId: row }, block: 'start' })
  if (moved.deny !== undefined) $.ui.toast(`그 프롬프트로 이동하지 못했습니다: ${moved.deny}`)
}

async function removeMark($: EngineInterface, id: string) {
  const list = await update($, marks, l => l.filter(m => m.id !== id))
  await $.store.set(markKey, list)
  await update($, lastMark, v => (v === id ? null : v))
  await update($, openMark, v => (v === id ? null : v))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const sid = await $.session.id()
    storeKey = `tree:${sid}`
    markKey = `marks:${sid}`
    // reload 때는 $.state가 최신이다. 저장본은 비어 있을 때(새 프로세스, --resume)만 읽는다.
    const saved = (await $.store.get(storeKey)) as Tree | undefined
    await update($, tree, t => (t.nodes.length === 0 && saved !== undefined ? saved : t))
    const savedMarks = (await $.store.get(markKey)) as Bookmark[] | undefined
    await update($, marks, l => (l.length === 0 && savedMarks !== undefined ? savedMarks : l))

    await $.command.register({
      name: 'tree',
      description: '분기 트리 패널을 연다 (/tree reset: 이 세션의 트리 비우기)',
    })
    await $.tool.register({
      name: 'tree',
      isDeferred: false,
      description:
        '대화의 분기 트리를 관리한다. action: add(중요 지점 기록), branch(여러 갈래를 todo로 추가, options 필요), switch(id로 이동), done(id 또는 현재 노드 완료), edit(id의 parent·title·note 고치기), group(ids를 title로 묶기), ungroup(id 묶음 풀기), view(트리 보기). 결과로 현재 트리를 돌려준다.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'branch', 'switch', 'done', 'edit', 'group', 'ungroup', 'view'] },
          ids: { type: 'array', items: { type: 'string' }, description: 'group: 묶을 노드 id들(이어진 한 덩어리)' },
          parent: { type: 'string', description: 'edit: 새 부모 노드 id (잘못 붙은 노드 옮기기)' },
          title: { type: 'string', description: 'add: 짧은 제목' },
          note: { type: 'string', description: 'add/done: 요청/한 일/남은 일을 쉬운 말로 짧게 (줄마다 하나)' },
          id: { type: 'string', description: 'switch/done: 노드 id (예: n12)' },
          options: {
            type: 'array',
            description: 'branch: 갈래 목록',
            items: {
              type: 'object',
              properties: { title: { type: 'string' }, note: { type: 'string' } },
              required: ['title'],
            },
          },
        },
        required: ['action'],
      },
    })
    // 다시 읽힐 때 사람이 닫아 둔 패널은 다시 열지 않는다.
    if ((await read($, paneOpen)) !== false) {
      void $.ui.open({ id: PANE, title: '분기 트리' })
      await update($, paneOpen, () => true)
    }

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const { sections } = await next(e)
    return { sections: [...sections, { id: 'prompt-tree:guide', text: GUIDE, scope: 'session' }] }
  })

  on('command.run', { command: 'tree' }, async ($, e) => {
    if (e.args.trim() === 'reset') {
      await change($, () => EMPTY)
      return { text: '이 세션의 분기 트리를 비웠습니다.' }
    }
    await $.ui.open({ id: PANE, title: '분기 트리' })
    await update($, paneOpen, () => true)
    return { text: '분기 트리 패널을 열었습니다.' }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const a = e as unknown as Args
    const now = await $.clock.now()
    const row = (await read($, lastPrompt)) ?? undefined
    const t0 = await read($, tree)
    const has = (id?: string) => id !== undefined && t0.nodes.some(n => n.id === id)

    if (a.action === 'add' || a.action === 'branch') {
      const items = a.action === 'add' ? [{ title: a.title, note: a.note }] : (a.options ?? [])
      if (items.length === 0 || items.some(o => !o.title)) return { deny: 'title(또는 options[].title)이 필요합니다.' }
      await change($, t => {
        const made = items.map((o, i) => ({
          id: `n${t.seq + i + 1}`,
          parent: t.current,
          title: o.title ?? '',
          note: o.note ?? '',
          status: (a.action === 'add' ? 'step' : 'todo') as NodeStatus,
          at: now,
          row,
        }))
        return {
          ...t,
          nodes: [...t.nodes, ...made],
          seq: t.seq + made.length,
          current: a.action === 'add' ? made[0]!.id : t.current,
        }
      })
    } else if (a.action === 'switch') {
      if (!has(a.id)) return { deny: `없는 노드: ${a.id}` }
      await change($, t => ({
        ...t,
        current: a.id!,
        nodes: t.nodes.map(n => (n.id === a.id && n.status === 'todo' ? { ...n, status: 'doing' } : n)),
      }))
    } else if (a.action === 'done') {
      const id = a.id ?? t0.current ?? undefined
      if (!has(id)) return { deny: `없는 노드: ${id}` }
      await change($, t => ({
        ...t,
        nodes: t.nodes.map(n =>
          n.id === id ? { ...n, status: 'done', note: a.note ? `${n.note}\n완료: ${a.note}` : n.note } : n,
        ),
      }))
    } else if (a.action === 'edit') {
      // 잘못 붙은 노드를 옮기거나 제목·메모를 고친다. 자기 자손 밑으로는 옮기지 않는다.
      if (!has(a.id)) return { deny: `없는 노드: ${a.id}` }
      if (a.parent !== undefined) {
        if (!has(a.parent)) return { deny: `없는 부모: ${a.parent}` }
        if (isUnder(t0, a.parent, a.id!)) return { deny: '자기 자신이나 자손 밑으로는 옮길 수 없습니다.' }
      }
      await change($, t => {
        const next = {
          ...t,
          nodes: t.nodes.map(n =>
            n.id === a.id
              ? { ...n, parent: a.parent ?? n.parent, title: a.title ?? n.title, note: a.note ?? n.note }
              : n,
          ),
        }
        return a.parent !== undefined ? dropGroupsOf(next, a.id!) : next
      })
    } else if (a.action === 'group') {
      const ids = a.ids ?? []
      if (ids.length < 2 || !a.title) return { deny: 'ids(2개 이상)와 title이 필요합니다.' }
      const missing = ids.filter(id => !has(id))
      if (missing.length > 0) return { deny: `없는 노드: ${missing.join(', ')}` }
      if ((t0.groups ?? []).some(g => g.members.some(m => ids.includes(m)))) return { deny: '이미 다른 묶음에 든 노드가 있습니다.' }
      if (!isConnected(t0, ids)) return { deny: '묶을 노드는 이어진 한 덩어리(뿌리 하나)여야 합니다.' }
      await change($, t => {
        const groups = t.groups ?? []
        const n = groups.reduce((m, g) => Math.max(m, Number(g.id.slice(1)) || 0), 0) + 1
        const group: Group = { id: `g${n}`, title: a.title!, note: a.note ?? '', members: ids, collapsed: true }
        return { ...t, groups: [...groups, group] }
      })
    } else if (a.action === 'ungroup') {
      if (!(t0.groups ?? []).some(g => g.id === a.id)) return { deny: `없는 묶음: ${a.id}` }
      await change($, t => ({ ...t, groups: (t.groups ?? []).filter(g => g.id !== a.id) }))
    } else if (a.action !== 'view') {
      return { deny: 'action은 add, branch, switch, done, edit, group, ungroup, view 중 하나입니다.' }
    }

    return { result: asText(await read($, tree)) }
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, lastMark, () => null)
    await update($, bandNote, () => null)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const lastId = await read($, lastMark)
    const open = (await read($, paneOpen)) === true
    const last = (await read($, marks)).find(m => m.id === lastId)
    const note = (await read($, bandNote)) ?? '답변을 드래그한 뒤 누르면 저장'

    return (
      <Box columnGap={1}>
        {/* 터미널에서 [ ]만으로는 눈에 덜 띄어서, 배경을 칠한 알약 모양 버튼으로 그린다. */}
        <Button key="tree" plain onPress={() => toggleTree($)}>
          <Text backgroundColor={GRAY} color={INK} bold>
            {open ? ' ⎇ Tree ▾ ' : ' ⎇ Tree ▸ '}
          </Text>
        </Button>
        <Button key="mark" plain onPress={() => addMark($)}>
          <Text backgroundColor={CRAIL} color={IVORY} bold>
            {' ★ Bookmark '}
          </Text>
        </Button>
        {last === undefined && <Text dimColor> {note}</Text>}
        {last !== undefined && (
          <Text dimColor>
            {last.row === undefined ? ' 저장됨(위치 없음): ' : ' 저장됨: '}
            {cut(oneLine(last.text), e.props.bodyColumns - 36)}{' '}
          </Text>
        )}
        {last !== undefined && (
          <Button key="undo" plain onPress={() => removeMark($, last.id)}>
            <Text backgroundColor={GRAY} color={INK} bold>
              {' ↶ Undo '}
            </Text>
          </Button>
        )}
      </Box>
    )
  })

  // 형광펜은 형광펜 자체를 누르거나, 입력창에 타자를 치거나, 패널·띠의 다른 버튼을 누르면 지운다.
  on('ui.press', async ($, e, next) => {
    const done = await next(e)
    if (e.element !== 'jump' && (await read($, highlight)) !== null) await update($, highlight, () => null)
    return done
  })

  on('session.append', { door: 'prompt' }, async ($, e, next) => {
    if (e.agentId === undefined) await update($, lastPrompt, () => e.uuid)
    return next(e)
  })

  on('prompt.change', async ($, e, next) => {
    if ((await read($, highlight)) !== null) await update($, highlight, () => null)
    return next(e)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const hl = await read($, highlight)
    if (hl === null || hl.row !== e.requestId) return next(e)
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const lines = e.props.text.split('\n')
    const [a, b] = markedLines(e.props.text, hl.text)
    const before = lines.slice(0, a).join('\n')
    const after = lines.slice(b + 1).join('\n')

    return (
      <Box flexDirection="row">
        <Text>{e.props.isFirstOfReply ? '● ' : '  '}</Text>
        <Box flexDirection="column" flexGrow={1}>
          {before.trim() !== '' && <Markdown text={before} />}
          <Button key="hl" plain onPress={() => update($, highlight, () => null)}>
            <Text backgroundColor={MARKER} color={INK}>
              {lines.slice(a, b + 1).join('\n')}
            </Text>
          </Button>
          {after.trim() !== '' && <Markdown text={after} />}
        </Box>
      </Box>
    )
  })

  // 드래그 화면 모듈이 보내는 것: 그냥 클릭 {select}, 끌어 놓기 {move, to}
  on('ui.message', { element: 'graph' }, async ($, e) => {
    const d = e.data as { select?: string; move?: string; to?: string }
    if (d.select !== undefined) await pickRow($, d.select)
    if (d.move !== undefined && d.to !== undefined) await moveNode($, d.move, d.to)
    return {}
  })

  // 사람이 패널의 닫기 표시나 키로 닫아도 Tree 버튼 상태를 맞춘다.
  on('ui.close', async ($, e, next) => {
    const done = await next(e)
    if (e.id === PANE) await update($, paneOpen, () => false)
    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    // 마우스 드래그는 Client(터미널·데스크톱)에서만 된다. 나머지 화면은 누르기만 되는 줄로 그린다.
    const Client = 'Client' in els ? els.Client : undefined
    const t = await read($, tree)
    const pick = await read($, selected)
    const list = await read($, marks)
    const openId = await read($, openMark)
    const todo = t.nodes.filter(n => n.status === 'todo').length
    const shown = display(t)
    const rows = graph(shown)
    const chosen = t.nodes.find(n => n.id === pick)
    // 상세의 상태 칸은 그래프에서 그 노드가 그려진 레인 색과 같게 칠한다.
    const chosenColor = LANE_COLORS[(rows.find(r => r.node.id === pick)?.lane ?? 0) % LANE_COLORS.length]
    const opened = list.find(m => m.id === openId)
    // 왼쪽 트리 칸은 내용만큼만(최대 절반) 잡고, 남는 오른쪽은 북마크. 노드를 열면 상세가 북마크 위에 뜬다.
    const total = e.props.bodyColumns
    const isWide = total >= 60
    const need = Math.max(20, ...rows.map(r => r.cells.length + 1 + cellWidth(r.node.title) + 2))
    const treeW = isWide ? Math.min(need, Math.floor((total - 2) / 2)) : total
    const sideW = isWide ? total - treeW - 2 : total
    const view = viewRows(shown, rows, treeW, pick)

    const graphView =
      Client !== undefined ? (
        <Client key="graph" module="./graph-view.tsx" props={{ rows: view }} height={view.length} />
      ) : (
        view.map(r => (
          <Button key={r.id} plain onPress={() => pickRow($, r.id)}>
            {r.runs.map(run => (
              <Text color={run.color} bold={run.bold}>
                {run.ch}
              </Text>
            ))}
            <Text bold={r.bold} color={r.color || undefined} dimColor={r.dim} italic={r.italic}>
              {' ' + r.title}
            </Text>
          </Button>
        ))
      )

    const nodeDetail = chosen !== undefined && (
      <Box flexDirection="column" borderStyle="round" borderColor={GRAY} paddingX={1}>
        {/* 상태 칸은 줄어들지 않는 고정 칸, 제목은 오른쪽 칸 안에서만 줄바꿈(상태 칸 색이 아랫줄로 번지지 않게). */}
        <Box flexDirection="row" alignItems="flex-start" columnGap={1}>
          <Box flexShrink={0}>
            <Text backgroundColor={chosenColor} color={INK} bold wrap="truncate">
              {` ${STATUS_TEXT[chosen.status]} `}
            </Text>
          </Box>
          <Box flexGrow={1} flexShrink={1}>
            <Text bold wrap="wrap">
              {chosen.title} <Text dimColor>{chosen.id}</Text>
            </Text>
          </Box>
        </Box>
        {chosen.note === '' && <Text dimColor>(메모 없음)</Text>}
        {noteParts(chosen.note).map((part, i) => (
          <Box flexDirection="row" alignItems="flex-start" marginTop={i === 0 ? 1 : 0}>
            <Box width={9} flexShrink={0}>
              {part.label !== null && (
                <Text>
                  <Text color={part.color ?? undefined}>▌</Text>
                  <Text color={IVORY} bold>
                    {part.label}
                  </Text>
                </Text>
              )}
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="wrap" dimColor={part.label === null}>
                {part.text}
              </Text>
            </Box>
          </Box>
        ))}
        <Box columnGap={1} marginTop={1}>
          {chosen.row !== undefined && (
            <Button key="go" plain onPress={() => jumpToNode($, chosen.row!)}>
              <Text backgroundColor={CRAIL} color={IVORY} bold>
                {' Jump '}
              </Text>
            </Button>
          )}
          <Button key="ask" plain onPress={() => askFrom($, chosen.id)}>
            <Text backgroundColor={CRAIL} color={IVORY} bold>
              {' Ask here '}
            </Text>
          </Button>
          <Button key="close" plain onPress={() => update($, selected, () => null)}>
            <Text backgroundColor={GRAY} color={INK} bold>
              {' Close '}
            </Text>
          </Button>
        </Box>
      </Box>
    )

    const bookmarks = (
      <Box flexDirection="column">
        <Text dimColor>북마크 {list.length}개</Text>
        {list.map(m => (
          <Button key={m.id} plain onPress={() => update($, openMark, v => (v === m.id ? null : m.id))}>
            <Text color={CRAIL}>★ </Text>
            <Text color={m.id === openId ? IVORY : undefined} bold={m.id === openId}>
              {cut(oneLine(m.text), sideW - 3)}
            </Text>
          </Button>
        ))}
        {opened !== undefined && (
          <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor={GRAY} paddingX={1}>
            <Text dimColor>
              {opened.node === null ? '트리 노드 없음' : `트리 ${opened.node} 진행 중 저장`}
              {opened.row === undefined ? ' · 위치 없음(여러 행에 걸쳐 드래그됨)' : ''}
            </Text>
            <Text wrap="wrap">{opened.text}</Text>
            <Box columnGap={1} marginTop={1}>
              {opened.row !== undefined && (
                <Button key="jump" plain onPress={() => jumpTo($, opened.row!, opened.text)}>
                  <Text backgroundColor={CRAIL} color={IVORY} bold>
                    {' Jump '}
                  </Text>
                </Button>
              )}
              <Button key="del" plain onPress={() => removeMark($, opened.id)}>
                <Text backgroundColor={GRAY} color={INK} bold>
                  {' Delete '}
                </Text>
              </Button>
              <Button key="fold" plain onPress={() => update($, openMark, () => null)}>
                <Text backgroundColor={GRAY} color={INK} bold>
                  {' Fold '}
                </Text>
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    )

    return (
      <Box flexDirection={isWide ? 'row' : 'column'} columnGap={2}>
        <Box flexDirection="column" width={isWide ? treeW : undefined} flexShrink={0}>
          <Text dimColor wrap="truncate-end">
            {t.nodes.length === 0 ? '아직 노드가 없습니다.' : `노드 ${t.nodes.length} · 대기 ${todo} · ○대기 ◉진행 ●기록`}
          </Text>
          {graphView}
        </Box>
        <Box flexDirection="column" flexGrow={1} marginTop={isWide ? 0 : 1}>
          {/* 노드를 열면 상세가 위에 뜨고 북마크는 그 아래로 내려간다. */}
          {nodeDetail}
          <Box marginTop={chosen !== undefined ? 1 : 0}>{bookmarks}</Box>
        </Box>
      </Box>
    )
  })
}

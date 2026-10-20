import { expect, test } from 'claude-code/testing'

import { display, graph } from '../hooks/register'
import type { Tree, TreeNode } from '../types'

const n = (id: string, parent: string | null, status: TreeNode['status'] = 'step'): TreeNode => ({
  id, parent, title: id, note: '', status, at: 0,
})

test('A/B/C fork draws lanes like a git graph', async () => {
  const t: Tree = {
    seq: 7,
    current: 'n7',
    nodes: [
      n('n1', null),
      n('n2', 'n1', 'done'),
      n('n3', 'n1', 'doing'),
      n('n4', 'n1', 'todo'),
      n('n5', 'n2'),
      n('n6', 'n3'),
      n('n7', 'n1'),
    ],
  }
  const lines = graph(t).map(r => r.cells.map(c => c.ch).join('').trimEnd())
  expect(lines).toEqual([
    '●─┬─┬─╮',
    '● │ │ │',
    '│ ◉ │ │',
    '│ │ ○ │',
    '● │   │',
    '  ●   │',
    '      ●',
  ])
})

test('a branch of a branch goes further right, never back left', async () => {
  // n1 ─ n2 ─ n3(갈래 from n2) ─ n4(갈래 from n3), 그리고 n2 줄기가 계속 이어짐
  const t: Tree = {
    seq: 6,
    current: 'n6',
    nodes: [n('n1', null), n('n2', 'n1'), n('n3', 'n2'), n('n4', 'n2'), n('n5', 'n4'), n('n6', 'n4')],
  }
  const lanes = graph(t).map(r => r.lane)
  // n4는 n2 줄기(0)의 갈래 → 1, n6은 n4(1)의 갈래 → 2
  expect(lanes).toEqual([0, 0, 0, 1, 1, 2])
})

test('a forked child leaves its parent lane even when it is the only child', async () => {
  const t: Tree = { seq: 3, current: 'n3', nodes: [n('n1', null), n('n2', 'n1', 'todo'), { ...n('n3', 'n2'), fork: true }] }
  const rows = graph(t)
  expect(rows.map(r => r.lane)).toEqual([0, 0, 1])
  expect(rows.map(r => r.cells.map(c => c.ch).join('').trimEnd())).toEqual(['●', '○─╮', '  ●'])
})

test('a collapsed group draws as one ◎ row; expanded it heads its members', async () => {
  const base: Tree = {
    seq: 5,
    current: 'n5',
    nodes: [n('n1', null), n('n2', 'n1'), n('n3', 'n2'), n('n4', 'n3'), n('n5', 'n4')],
    groups: [{ id: 'g1', title: '초기 작업', note: '', members: ['n1', 'n2', 'n3'], collapsed: true }],
  }
  const closed = graph(display(base)).map(r => r.cells.map(c => c.ch).join('').trimEnd() + ' ' + r.node.title)
  expect(closed).toEqual(['◎ 초기 작업 (3) ▸', '● n4', '● n5'])

  const open = { ...base, groups: [{ ...base.groups![0]!, collapsed: false }] }
  const opened = graph(display(open)).map(r => r.cells.map(c => c.ch).join('').trimEnd() + ' ' + r.node.title)
  expect(opened).toEqual(['◎ 초기 작업 ▾', '● n1', '● n2', '● n3', '● n4', '● n5'])

  // 현재 노드가 접힌 묶음 안이면 묶음이 현재가 된다
  expect(display({ ...base, current: 'n2' }).current).toBe('g1')
})

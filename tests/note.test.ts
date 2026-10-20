import { expect, test } from 'claude-code/testing'

import { noteParts } from '../hooks/register'

test('splits a note into colored 요청/한 일/남은 일 parts', async () => {
  const parts = noteParts('요청: 읽기 어렵다\n한 일: 세 줄로 바꿈\n남은일: 예전 노드')
  expect(parts.map(p => [p.label, p.text])).toEqual([
    ['요청', '읽기 어렵다'],
    ['한 일', '세 줄로 바꿈'],
    ['남은 일', '예전 노드'],
  ])
  expect(noteParts('요청: a / 한 일: b').length).toBe(2)
  expect(noteParts('옛 메모 한 줄')[0]).toEqual({ label: null, color: null, text: '옛 메모 한 줄' })
})

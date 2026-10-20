import { expect, test } from 'claude-code/testing'

import { markedLines } from '../hooks/register'

const MD = ['## 결과', '', '- **수율**은 `20%`로 올랐다.', '- 다음 단계는 B 작업이다.', '', '끝.'].join('\n')

test('finds the markdown lines a dragged (rendered) text came from', async () => {
  expect(markedLines(MD, '• 수율은 20%로 올랐다.')).toEqual([2, 2])
  expect(markedLines(MD, '수율은 20%로 올랐다.\n• 다음 단계는 B 작업이다.')).toEqual([2, 3])
  expect(markedLines(MD, '없는 글')).toEqual([0, 5])
})

import { expect, mock, test } from 'claude-code/testing'

const TOOL = 'mcp__prompt-tree__tree'
const PANE = {
  plugin: 'prompt-tree',
  component: 'Pane',
  requestId: 'prompt-tree',
  props: {
    title: '분기 트리',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('branch A/B/C, finish A, jump back to B', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  on('session.id', () => ({ value: 's1' }))
  on('command.register', () => ({ value: { command: 'tree' } }))
  on('tool.register', () => ({ value: { tool: TOOL } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  let filled = ''
  on('prompt.fill', (_, e) => {
    filled = e.text
    return { isFilled: true }
  })

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: TOOL, action: 'add', title: '수율 분석 시작', note: 'n' })
  await $.tool.call({
    tool: TOOL,
    action: 'branch',
    options: [{ title: 'A 작업' }, { title: 'B 작업', note: '요청: B 맥락\n한 일: 아직' }, { title: 'C 작업' }],
  })
  await $.tool.call({ tool: TOOL, action: 'switch', id: 'n2' })
  await $.tool.call({ tool: TOOL, action: 'add', title: 'A 중간 결과' })
  await $.tool.call({ tool: TOOL, action: 'done', id: 'n2' })
  const view = await $.tool.call({ tool: TOOL, action: 'view' })
  expect(String(view.result)).toContain('남은 todo 갈래: n3 B 작업, n4 C 작업')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /· 대기 [12] ·/ }))?.text).toBeDefined()
    // 그래프 줄 클릭(끌지 않고 뗌) = 노드 상세 열기. n3는 3번째 줄.
    await ui.pointer({ type: 'down', x: 2, y: 2, button: 'left' })
    await ui.pointer({ type: 'up', x: 2, y: 2, button: 'left' })
    expect((await ui.find({ type: 'Text', text: /^한 일$/ }))?.text).toBe('한 일')
    await ui.press({ key: 'ask' })
    expect(filled).toContain('[트리 n3]')
    expect(filled).toContain('B 맥락')
    await ui.unmount()
  }
})

const BAND = {
  plugin: 'prompt-tree',
  component: 'AbovePrompt',
  requestId: 'above',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 6,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 6 },
    view: {},
  },
} as const

test('bookmark the selection, show it beside the tree, undo it', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  on('session.id', () => ({ value: 's1' }))
  on('command.register', () => ({ value: { command: 'tree' } }))
  on('tool.register', () => ({ value: { tool: TOOL } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  let picked: string | undefined = '이 부분이 중요한 결론'
  on('ui.selection', () => ({ value: picked === undefined ? undefined : { text: picked, requestId: 'msg-7' } }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    await band.press({ key: 'mark' })
    expect((await band.find({ type: 'Text', text: /저장됨: 이 부분이 중요한 결론/ }))?.text).toBeDefined()

    const pane = await $.ui.mount({ ...PANE, surface, props: { ...PANE.props, bodyColumns: 90 } })
    expect((await pane.find({ type: 'Text', text: /북마크 1개/ }))?.text).toBeDefined()
    await pane.press({ key: (await pane.find({ type: 'Button', text: /이 부분이/ }))!.key! })
    // 대화 행 스크롤은 테스트 키트에 대화 화면이 없어 실제 세션에서만 확인한다. 버튼이 뜨는지만 본다.
    expect(await pane.find({ key: 'jump' })).toBeDefined()
    await band.press({ key: 'undo' })
    expect((await pane.find({ type: 'Text', text: /북마크 0개/ }))?.text).toBeDefined()

    picked = undefined
    await band.press({ key: 'mark' })
    expect((await band.find({ type: 'Text', text: /먼저 답변에서/ }))?.text).toBeDefined()
    picked = '이 부분이 중요한 결론'
    await band.unmount()
    await pane.unmount()
  }
})

test('drag a node onto another node to branch it there', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  on('session.id', () => ({ value: 's1' }))
  on('command.register', () => ({ value: { command: 'tree' } }))
  on('tool.register', () => ({ value: { tool: TOOL } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(JSON.stringify(e))
    return { value: undefined }
  })

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  for (const title of ['하나', '둘', '셋', '넷']) await $.tool.call({ tool: TOOL, action: 'add', title })
  const view = async () => String((await $.tool.call({ tool: TOOL, action: 'view' })).result)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    // 넷(4번째 줄)을 끌어 둘(2번째 줄)에 놓는다 → 셋과 나란한 갈래
    await ui.pointer({ type: 'down', x: 2, y: 3, button: 'left' })
    await ui.pointer({ type: 'move', x: 2, y: 2, button: 'left' })
    await ui.pointer({ type: 'move', x: 2, y: 1, button: 'left' })
    await ui.advance(50)
    expect((await ui.find({ type: 'Text', text: /여기 밑으로/, in: 'graph' }))?.text).toBeDefined()
    await ui.pointer({ type: 'up', x: 2, y: 1, button: 'left' })
    expect(await view()).toContain('  • [n4] 넷')
    expect(await view()).toContain('  • [n3] 셋')

    // 하나(첫 줄)를 자기 밑의 넷(이제 마지막 줄) 위에 놓으면 거절
    await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left' })
    await ui.pointer({ type: 'move', x: 0, y: 3, button: 'left' })
    await ui.pointer({ type: 'up', x: 0, y: 3, button: 'left' })
    expect(toasts.length).toBeGreaterThan(0)

    // 넷을 다시 셋 밑으로 돌려놓는다
    await ui.pointer({ type: 'down', x: 2, y: 3, button: 'left' })
    await ui.pointer({ type: 'up', x: 2, y: 2, button: 'left' })
    expect(await view()).toContain('• [n4] 넷')

    // 마지막 노드(넷)를 바로 위 부모(셋)에 놓으면 그 자리에서 갈라지고, 셋은 대기(○)가 된다
    await ui.pointer({ type: 'down', x: 2, y: 3, button: 'left' })
    await ui.pointer({ type: 'up', x: 2, y: 2, button: 'left' })
    expect(await view()).toContain('○ [n3] 셋')
    // 한 번 더 놓으면 되돌린다
    await ui.pointer({ type: 'down', x: 2, y: 3, button: 'left' })
    await ui.pointer({ type: 'up', x: 2, y: 2, button: 'left' })
    expect(await view()).toContain('• [n3] 셋')
    await ui.unmount()
  }
})

test('opened node detail sits above the bookmarks; Tree button toggles the pane', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  on('session.id', () => ({ value: 's1' }))
  on('command.register', () => ({ value: { command: 'tree' } }))
  on('tool.register', () => ({ value: { tool: TOOL } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: TOOL, action: 'add', title: '하나', note: '요청: 테스트' })

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: 90 } })
  expect(await pane.find({ type: 'Text', text: /북마크 0개/ })).toBeDefined()
  await pane.pointer({ type: 'down', x: 0, y: 0, button: 'left' })
  await pane.pointer({ type: 'up', x: 0, y: 0, button: 'left' })
  // 상세가 떠도 북마크는 그 아래에 그대로 보인다.
  expect(await pane.find({ key: 'ask' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /북마크 0개/ })).toBeDefined()
  await pane.press({ key: 'close' })
  expect(await pane.find({ type: 'Text', text: /북마크 0개/ })).toBeDefined()
  await pane.unmount()

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await band.find({ type: 'Text', text: /Tree ▾/ }))?.text).toBeDefined()
  await band.press({ key: 'tree' })
  expect((await band.find({ type: 'Text', text: /Tree ▸/ }))?.text).toBeDefined()
  await band.press({ key: 'tree' })
  expect((await band.find({ type: 'Text', text: /Tree ▾/ }))?.text).toBeDefined()
  await band.unmount()
})

test('group old nodes, click ◎ to expand and collapse, ungroup', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  on('session.id', () => ({ value: 's1' }))
  on('command.register', () => ({ value: { command: 'tree' } }))
  on('tool.register', () => ({ value: { tool: TOOL } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
  for (const title of ['하나', '둘', '셋', '넷']) await $.tool.call({ tool: TOOL, action: 'add', title })
  const bad = await $.tool.call({ tool: TOOL, action: 'group', ids: ['n1', 'n3'], title: 'x' })
  expect(bad.deny).toContain('이어진')
  const ok = await $.tool.call({ tool: TOOL, action: 'group', ids: ['n1', 'n2', 'n3'], title: '초반' })
  expect(String(ok.result)).toContain('묶음 [g1] 초반: n1, n2, n3')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /초반 \(3\) ▸/, in: 'graph' })).toBeDefined()
  await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left' })
  await ui.pointer({ type: 'up', x: 0, y: 0, button: 'left' })
  expect(await ui.find({ type: 'Text', text: /초반 ▾/, in: 'graph' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^셋$/, in: 'graph' })).toBeDefined()
  // 펼친 묶음 안의 노드는 회색, 노드를 두 번 누르면 상세가 닫힌다
  expect(JSON.stringify(await ui.drawn({ in: 'graph' }))).toContain('#b0aea5')
  await ui.pointer({ type: 'down', x: 0, y: 4, button: 'left' })
  await ui.pointer({ type: 'up', x: 0, y: 4, button: 'left' })
  expect(await ui.find({ key: 'ask' })).toBeDefined()
  await ui.pointer({ type: 'down', x: 0, y: 4, button: 'left' })
  await ui.pointer({ type: 'up', x: 0, y: 4, button: 'left' })
  expect(await ui.find({ key: 'ask' })).toBeUndefined()
  await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left' })
  await ui.pointer({ type: 'up', x: 0, y: 0, button: 'left' })
  expect(await ui.find({ type: 'Text', text: /^셋$/, in: 'graph' })).toBeUndefined()
  await ui.unmount()

  // 묶은 뒤 노드를 더 추가해도 묶음이 남아야 한다
  await $.tool.call({ tool: TOOL, action: 'add', title: '다섯' })
  expect(String((await $.tool.call({ tool: TOOL, action: 'view' })).result)).toContain('묶음 [g1]')
  await $.tool.call({ tool: TOOL, action: 'ungroup', id: 'g1' })
  expect(String((await $.tool.call({ tool: TOOL, action: 'view' })).result)).not.toContain('묶음')
})

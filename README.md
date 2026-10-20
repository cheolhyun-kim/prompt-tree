# prompt-tree

A Claude Code mod that keeps a git-style tree of your conversation's key prompts and open branches beside the chat, so after finishing branch A you can jump back to B and C. (UI text is Korean.)

Claude Code 대화의 중요한 지점과 갈라진 작업(갈래)을 채팅 옆에 git 그래프처럼 보여 주는 Mod입니다. A 작업을 오래 하다가도 남겨 둔 B, C 갈래로 바로 돌아갈 수 있습니다.

## 설치

Claude Code 터미널 입력창에서:

```
/plugin install prompt-tree --marketplace cheolhyun-kim/prompt-tree
```

`Add marketplace?`에 `y`, 범위(scope)는 Enter로 고르면 바로 켜집니다.

셸에서:

```
claude plugin install prompt-tree --marketplace cheolhyun-kim/prompt-tree
```

데스크톱 앱에서는 입력창 옆 + → Plugins → Add marketplace에 `cheolhyun-kim/prompt-tree` → Add plugin.

### 업데이트

```
claude plugin update prompt-tree
```

그 뒤 Claude Code 안에서 `/reload-plugins`.

## 기능

- **분기 트리 패널**: Claude가 중요한 프롬프트와 답변, 제안한 갈래(A/B/C)를 노드로 기록합니다. ○ 대기 · ◉ 진행 · ● 기록 · ✓ 완료, 현재 위치는 주황 원이 깜빡입니다.
- **노드 상세**: 노드를 누르면 요청 / 한 일 / 남은 일 메모가 열립니다. `Jump`는 그 프롬프트 위치로 스크롤, `Ask here`는 그 지점에서 이어 질문할 문장을 입력창에 채웁니다. 다시 누르면 닫힙니다.
- **드래그로 갈래 만들기**: 노드를 끌어 다른 노드에 놓으면 그 밑으로 옮겨집니다. 자기 바로 위 노드에 놓으면 그 자리에서 갈라지고 위 노드는 대기(○)가 됩니다.
- **묶음(◎)**: 오래된 연속 노드를 하나로 접어 둡니다. 누르면 펼쳐지고, 안의 노드는 회색으로 보입니다.
- **북마크**: 답변 일부를 드래그하고 입력창 위 `★ Bookmark`를 누르면 저장됩니다. `↶ Undo`로 취소, 북마크의 `Jump`로 그 위치에 형광펜을 칠해 이동합니다.
- **Tree 버튼**: 입력창 위 `⎇ Tree`로 패널을 열고 닫습니다. `/tree`도 같고, `/tree reset`은 이 세션의 트리를 비웁니다.

트리와 북마크는 세션마다 따로 저장되고, `--resume`으로 같은 세션을 다시 열면 남아 있습니다.

## 제약

- 패널이 대화 오른쪽에 붙는 것, 마우스 드래그·클릭, 북마크용 드래그 읽기는 **전체화면 터미널 레이아웃**(폭 110칸 이상)과 데스크톱 앱에서만 됩니다. 그 밖에는 패널이 입력창 위에 뜹니다.
- tmux 안에서는 터미널이 마우스 움직임을 넘겨주지 않으면 드래그가 안 될 수 있습니다.

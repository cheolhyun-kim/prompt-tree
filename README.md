# prompt-tree

English | [한국어](README.ko.md)

A Claude Code mod that keeps a git-style tree of your conversation's key prompts and open branches beside the chat. When Claude proposes A, B and C and you spend a day on A, the B and C branches are still waiting in the tree, one click away. (The mod's on-screen text is in Korean.)

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install prompt-tree --marketplace cheolhyun-kim/prompt-tree
```

Answer `y` to `Add marketplace?`, then pick a scope with Enter. The mod is active right away.

From a shell:

```
claude plugin install prompt-tree --marketplace cheolhyun-kim/prompt-tree
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `cheolhyun-kim/prompt-tree`, then Add plugin.

### Update

```
claude plugin update prompt-tree
```

then run `/reload-plugins` inside Claude Code.

## Features

- **Branch tree pane**: Claude records important prompts and answers, and the branches it proposes (A/B/C), as nodes. ○ waiting · ◉ in progress · ● record · ✓ done. The current position is a blinking orange dot.
- **Node details**: click a node to open its note (request / what was done / what's left). `Jump` scrolls the chat to that prompt; `Ask here` fills the prompt box with a message to continue from that point. Click the node again to close.
- **Drag to re-branch**: drag a node onto another node to move it under that node. Drop it on its own parent to split it off as a new branch; the parent becomes waiting (○).
- **Groups (◎)**: older runs of finished nodes are folded into one node. Click to expand; nodes inside a group are drawn in gray.
- **Bookmarks**: select part of an answer with the mouse and press `★ Bookmark` above the prompt. `↶ Undo` takes it back; a bookmark's `Jump` scrolls to it and highlights the passage.
- **Tree button**: `⎇ Tree` above the prompt opens and closes the pane. `/tree` does the same; `/tree reset` clears this session's tree.

The tree and bookmarks are kept per session and come back when you reopen the same session with `--resume`.

## Limits

- Docking the pane to the right of the chat, mouse drag and click, and reading a selection for bookmarks work only in the **fullscreen terminal layout** (110 columns or wider) and in the desktop app. Elsewhere the pane opens above the prompt.
- Inside tmux, dragging may not work unless the terminal passes mouse motion through.

# WebWordStar

A clean-room, browser-based reimplementation of **WordStar** for the modern era.

WebWordStar brings the classic WordStar editing experience to the browser, faithful
to the original keyboard-first interface — the diamond cursor (`^E` `^S` `^D` `^X`),
`^K` block commands, `^Q` quick commands, and dot commands — while extending it with
real-time multiuser collaborative editing over WebSockets.

## Philosophy

These interfaces were already correct. WordStar's keyboard-driven design let writers
keep their hands on the keys and their attention on the words, and decades of muscle
memory proved how well it worked. We're not replacing that design — we're bringing it
forward, running natively in the browser and connected to collaborators in real time.

## Features

- **Faithful keyboard-first interface** — the WordStar diamond for cursor movement,
  `^K` block operations, `^Q` quick navigation, and dot commands for formatting.
- **Real-time collaborative editing** — multiple users editing the same document
  simultaneously, synchronized over WebSockets.
- **Terminal aesthetic** — the familiar WordStar look and feel, rendered in the browser.

## Technical Overview

- **Node.js** backend
- **WebSockets** for real-time collaboration
- **SQLite** for document persistence
- **TypeScript** throughout
- **Terminal aesthetic** in the browser

## Status

Early planning stage, active development. Expect things to change rapidly.

## Related

Built by the same author as [WebBaseIII](https://github.com/DDecoene/WebBaseIII),
a dBASE III clone that runs in the browser. WebWordStar continues the same idea:
bring forward the interfaces that were already right.

# Lumen

> Your notes, smarter. A second brain that never leaves your browser.

Lumen is a local-first knowledge graph app. Notes become nodes, shared ideas become edges, and your thinking becomes *visible*. No server, no account, no tracking — everything runs in your browser.

This repo is **v0.1**: a single-file, zero-build web app that demonstrates the core experience on a seeded workspace about *how to learn effectively*.

## Live demo

→ **[sillanaresh.github.io/lumen](https://sillanaresh.github.io/lumen/)**

## What's in v0.1

- **Interactive D3 force-directed graph** of 12 hand-written notes on learning science
- **Tag-based auto-linking** — notes sharing a tag form visible edges
- **Polished markdown viewer** with connections panel and tag chips
- **Fuzzy search** (Fuse.js) across titles, content, and tags
- **Add your own notes** — persisted in `localStorage`, joining the graph instantly
- **Export** your workspace as JSON at any time
- Dark, typographic, carefully-considered UI

## Try it locally

No build step. No install. Just:

```bash
# Clone and open
git clone <this-repo>
cd lumen
open index.html
# or: python3 -m http.server 8000
```

Works offline after first load. Everything you write stays in your browser's `localStorage`.

## Why local-first?

Most "AI notes" apps send your thoughts to someone else's server. Lumen flips that: your notes live in your browser's `IndexedDB` / `localStorage`. When future versions add AI features, they'll use on-device embeddings first, and show you *exactly* what leaves your machine before it does.

## Tech

| | |
|---|---|
| Build | None — single `index.html`, zero dependencies installed |
| UI | Tailwind (CDN), Inter + JetBrains Mono |
| Graph | D3.js v7 force-directed |
| Markdown | Marked.js |
| Search | Fuse.js fuzzy |
| Storage | Browser `localStorage` |
| Hosting | GitHub Pages — free, static, indefinite |

## Roadmap

- **v0.2** — In-browser semantic search (transformers.js + MiniLM embeddings). Connections become meaning-based, not just tag-based.
- **v0.3** — Ask your notes: retrieval-augmented Q&A via OpenRouter, with cited answers and a transparent "what will be sent" preview.
- **v0.4** — Ingest PDFs and URLs. Drop a paper, get a note with auto-extracted concepts that weave into the graph.
- **v0.5** — Optional sync via your own Dropbox/iCloud folder. We still store nothing.

## About this project

Lumen was built as a portfolio project — a deliberate exploration of what a *fast, private, beautiful* note-taking tool can feel like when it's built local-first from the start.

The full product thinking (PM brief, wedge, user journeys, success metrics) lives in the repo's design notes.

---

MIT License · No tracking, no analytics, no account.

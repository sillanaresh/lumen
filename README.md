# Lumen

> Your notes, smarter. A second brain that never leaves your browser.

Lumen is a local-first knowledge graph app. Notes become nodes, shared ideas become edges, and your thinking becomes *visible*. No server, no account, no tracking — everything runs in your browser.

This repo is **v0.3**: a single-file, zero-build web app that demonstrates the core experience on a seeded workspace about *how to learn effectively* — with real sentence embeddings running directly in your browser, and retrieval-augmented Q&A that cites its sources.

## Live demo

→ **[sillanaresh.github.io/lumen](https://sillanaresh.github.io/lumen/)**

## What's in v0.3

- **Interactive D3 force-directed graph** of 12 hand-written notes on learning science
- **Two edge modes**:
  - *Tags* — notes sharing a tag form visible edges (instant, no model needed)
  - *Semantic* — real sentence embeddings (MiniLM-L6-v2) compute meaning-based connections via on-device inference
- **Semantic search** that blends fuzzy keyword matching with embedding cosine similarity (65/35) when the AI is ready
- **Ask your notes** — retrieval-augmented Q&A:
  - Question is embedded client-side
  - Top-5 notes retrieved by cosine similarity
  - Context shown to you *before* it's sent (full transparency)
  - Answer streams from a free OpenRouter model (BYOK) with inline `[n01]`-style citations that link back to source notes
- **Polished markdown viewer** with connections panel and tag chips
- **Add your own notes** — persisted in `localStorage`, joining the graph instantly
- **Embedding cache** — computed vectors are stored in `IndexedDB`, keyed by content hash, so repeat visits are instant
- **Settings modal** — API key, model selection (Llama 3.3 70B, Gemini Flash, DeepSeek, Llama 8B), cache clear
- **Export** your workspace as JSON at any time
- Live AI status indicator — loading progress, ready state, errors
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
| Search | Fuse.js (fuzzy) + cosine similarity over embeddings (semantic) |
| Embeddings | transformers.js 2.17 running MiniLM-L6-v2 entirely in the browser |
| Q&A | OpenRouter free models (BYOK), direct browser→OpenRouter, SSE streaming |
| Storage | `localStorage` for notes, `IndexedDB` for embedding cache |
| Hosting | GitHub Pages — free, static, indefinite |

## Roadmap

- **v0.2** ✅ *Shipped* — In-browser semantic search (transformers.js + MiniLM embeddings).
- **v0.3** ✅ *Shipped* — Ask your notes: retrieval-augmented Q&A via OpenRouter free models, BYOK, streaming answers with inline citations.
- **v0.4** — Ingest PDFs and URLs. Drop a paper, get a note with auto-extracted concepts that weave into the graph.
- **v0.5** — Optional sync via your own Dropbox/iCloud folder. We still store nothing.

## About this project

Lumen was built as a portfolio project — a deliberate exploration of what a *fast, private, beautiful* note-taking tool can feel like when it's built local-first from the start.

The full product thinking (PM brief, wedge, user journeys, success metrics) lives in the repo's design notes.

---

MIT License · No tracking, no analytics, no account.

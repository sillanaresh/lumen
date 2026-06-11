# Lumen

> Local-first notes AI that shows its work.

Lumen is a single-file knowledge graph for notes with transparent RAG. Notes become graph nodes, long documents are chunked into citable passages, Ask shows the exact chunks and prompt before generation, and the built-in Quality Lab measures retrieval instead of hand-waving it.

Live demo: **[sillanaresh.github.io/lumen](https://sillanaresh.github.io/lumen/)**

## What Is New In v0.5

- **Chunked retrieval:** notes and imports are split into stable chunks such as `[n02.1]`, with configurable `CHUNK_SIZE_CHARS` and overlap.
- **Chunk-level citations:** answers can cite exact chunks, and clicking a citation opens the parent note with the cited passage highlighted.
- **Retrieval inspector:** every Ask card shows ranked chunks, blended scores, the exact prompt, and an input-token estimate.
- **Quality Lab:** open `#eval` to run a 58-case retrieval benchmark locally, including no-answer cases.
- **Before/after comparison:** the eval runner compares chunked retrieval with the older whole-note baseline.
- **Feedback hooks:** thumbs feedback is stored locally and can be exported or opened as a transparent GitHub issue draft.
- **Honest privacy copy:** Settings lists exactly what stays local and what leaves during Ask or URL import.
- **Onboarding and mobile read mode:** first-run tour plus a mobile path for Notes and Ask.

## Does It Actually Work?

Run the benchmark in the app:

1. Open `/lumen/#eval`.
2. Click **Run fast eval** for retrieval-only metrics with no API key.
3. Click **Run semantic eval** to use the same local MiniLM embeddings used by Ask.
4. Export Markdown and paste the table below.

| Run | Chunking | Mode | Cases | Hit@1 | Hit@5 | MRR | Whole-note Hit@5 | Lift | No-answer |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| local smoke | chunked | lexical | 58 | 80% | 100% | 0.89 | 100% | 0% | 75% |

The seeded notes are short, so whole-note retrieval already performs well at hit@5. Lumen 2.0's quality gain is more visible in exact chunk citations, inspector debugging, no-answer tracking, and long PDF/URL imports where whole-note embeddings collapse multiple topics into one vector.

Benchmark artifact: [`benchmark.json`](benchmark.json)  
Eval notes: [`docs/eval-report.md`](docs/eval-report.md)

## Privacy Model

Lumen is static and local-first, but not every action is purely local:

- **Notes, PDFs, embeddings, eval runs, and feedback** are stored in this browser unless you export or send them.
- **Ask** sends only the retrieved chunks shown in the inspector to OpenRouter, using your API key and selected model.
- **URL import** sends the pasted URL to `r.jina.ai` to fetch a readable copy.
- **Feedback send** opens a GitHub issue draft. You see the payload before posting.

There is no Lumen account, database, or app server.

## Try It Locally

No build step:

```bash
git clone https://github.com/sillanaresh/lumen.git
cd lumen
python3 -m http.server 8000
```

Open `http://localhost:8000`.

You can also open `index.html` directly, but a local server is better for browser module/CDN behavior.

## Deploy

### GitHub Pages

This repo is already shaped for GitHub Pages because it is a static `index.html`.

### Vercel

Vercel can deploy this as a static project:

1. Import the GitHub repo in Vercel.
2. Framework preset: **Other**.
3. Build command: leave empty.
4. Output directory: `.`.

`vercel.json` is included for clean static headers.

## Tech

| Area | Choice |
|---|---|
| Build | Single `index.html`, zero build step |
| UI | Tailwind CDN, Inter, JetBrains Mono |
| Graph | D3 force-directed graph |
| Markdown | Marked.js |
| Search | Fuse.js plus local lexical/semantic scoring |
| Embeddings | transformers.js MiniLM in the browser |
| Q&A | OpenRouter BYOK, streaming responses |
| Ingest | pdf.js for local PDF text extraction, `r.jina.ai` for URL reader mode |
| Storage | `localStorage` for notes/settings, IndexedDB for embeddings/eval runs |

## Testing

Manual walkthrough: [`TESTING.md`](TESTING.md)  
Tiny zero-dep test runner: open [`test.html`](test.html)

## Roadmap

- Generation evals: citation precision, LLM-as-judge faithfulness, and no-answer answer judging.
- Compare view for multiple saved eval runs.
- Optional folder sync via a user-owned local/cloud folder.

MIT License.

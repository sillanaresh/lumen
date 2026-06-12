# Lumen

> Private notes AI, measured in the open.

Lumen is a local-first knowledge graph for notes with **transparent RAG**: every AI answer ships with its evidence — the retrieved chunks and their scores, the exact prompt that left your browser, the token count, the cost — and the retrieval quality is measured by a **published benchmark you can run yourself, inside the app**.

**Live demo:** [sillanaresh.github.io/lumen](https://sillanaresh.github.io/lumen/)

## The thesis

Most AI note tools ask you to trust a black box. Lumen is built on the opposite bet: an AI product earns trust by **showing its work and publishing its numbers**.

That turns into three product commitments:

1. **Local-first.** Notes, embeddings, eval runs, feedback, and your API key live in this browser. No account, no server, no analytics in the app. Semantic search runs on a 22 MB MiniLM model *inside the page* (transformers.js).
2. **Transparent.** The Evidence panel shows the full question → retrieval → prompt → answer path for every ask. Citations like `[n02.1]` point at stable chunks; clicking one opens the source note at that passage.
3. **Measured.** The Eval Lab runs a 58-case benchmark — including 8 *no-answer traps* that test hallucination resistance — against the **same pure functions** the Ask feature calls. Runs persist locally, are comparable side-by-side, and export to JSON/Markdown.

## Honest refusal, by design

If even the best retrieved chunk scores below a confidence threshold, Lumen answers **"Your notes don't seem to cover this"** — *before* any model call — with a link to what was searched and an explicit "ask the model anyway" override. Refusing on weak retrieval is cheaper, faster, and more honest than asking a model not to hallucinate and hoping.

## Does it actually work?

Run it yourself: open the **Eval Lab** tab → *Run benchmark*. Lexical mode finishes in seconds with no API key or model download. Results below are from the seeded corpus (12 notes, 58 cases):

| Run | Mode | Top-k | Cases | Hit@1 | Hit@5 | MRR | Whole-note Hit@5 | Lift | No-answer | p50 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2026-06-12 | lexical | 3 | 58 | 76% | 98% | 0.86 | 98% | +0% | 75% | <1ms |
| 2026-06-12 | lexical | 5 | 58 | 76% | 98% | 0.86 | 98% | +0% | 75% | <1ms |
| 2026-06-12 | lexical | 8 | 58 | 76% | 98% | 0.86 | 98% | +0% | 75% | <1ms |
| 2026-06-12 | semantic · MiniLM | 5 | 58 | **86%** | **100%** | **0.92** | 98% | +2% | **100%** | 2ms |
| 2026-06-12 | semantic · BGE-small | 5 | 58 | 84% | 100% | 0.92 | 98% | +2% | **50%** | 4ms |

What the experiments actually taught us (full analysis in the eval report):

- **Semantic retrieval earns its keep**: +10 points of Hit@1 over keywords, and it fixes *both* hallucination traps that fooled the lexical gate (incidental keyword overlap like *"model"* matching the *Mental models* title doesn't fool cosine similarity).
- **The "better" embedder scored worse where it matters most.** BGE-small matches MiniLM on ranking but drops refusal accuracy to 50% — its similarity scores run hotter, so the no-answer threshold calibrated for MiniLM lets weak matches through. *Confidence thresholds don't transfer across embedders* — which is why the embedder is user-selectable and every eval run records which one produced it.
- **Chunking shows zero lift here by construction** — each seeded note fits in one chunk. Its value appears on long PDF/URL imports and in citation granularity (answers point at the exact passage).

With an API key, the Lab also scores **generation**: citation precision, LLM-judged faithfulness (strict-JSON judge, defensive parsing, errors counted visibly), and whether the model refuses the traps. And the **Benchmark Builder** drafts cases for *your own* corpus — questions generated from specific chunks so the gold label is provenance, every case human-approved, or upload your own JSON.

Benchmark: [`benchmark.json`](benchmark.json) · Methodology and caveats: [`docs/eval-report.md`](docs/eval-report.md)

## What leaves your machine

"Local-first" is a precise claim, not a slogan. Exactly three actions send data out, all user-initiated:

| Action | What is sent | To whom |
|---|---|---|
| Ask (with API key) | The retrieved chunks shown in Evidence + your question | OpenRouter, with **your** key, to the model **you** chose |
| URL import | The URL you paste | r.jina.ai, which returns a readable copy |
| Send feedback | A GitHub issue draft you see before posting | GitHub, only if you submit it |
| Opening Settings | A plain GET for the public model catalog (nothing about you) | OpenRouter |

The API key itself is **optional**: notes, graph, search, retrieval, and the Eval Lab's retrieval metrics all run with no key at all — only answer *generation* needs one.

Everything else — notes, PDFs (parsed in-browser by pdf.js), embeddings, eval runs, feedback, your key — stays in the browser. Clear site data and it's gone.

## Architecture

Zero build step. No framework. The app is plain ES modules served statically:

```
index.html          app shell (≈60 lines)
css/app.css         hand-rolled design system
js/
  pipeline.js       THE CORE — pure functions: chunking, scoring, retrieval,
                    no-answer gate, prompt builder, eval metrics. No DOM, no
                    storage, no network. Ask and the Eval Lab both call these.
  store.js          workspace state, localStorage/IndexedDB, embedding engine
  openrouter.js     streaming BYOK client with typed errors
  ui.js             DOM helpers, modal, toasts
  app.js            shell: router, ⌘K palette, settings, onboarding, import
  views/            library · graph · ask · lab · about
benchmark.json      58 eval cases (authored before tuning)
test.html           zero-dependency unit tests for pipeline.js (open it)
```

Key invariant: **the eval measures the real pipeline.** `views/ask.js` and `views/lab.js` import the same `rankChunks` / `isNoAnswer` / `buildPrompt` from `pipeline.js`, so benchmark numbers can't drift from production behavior.

| Area | Choice |
|---|---|
| Retrieval | ~300-token chunks (15% overlap, markdown-aware, code fences intact) · blend of 0.72·cosine + 0.28·keyword · linear scan (no vector DB needed at this scale) |
| Embeddings | MiniLM-L6-v2 via transformers.js, cached in IndexedDB by content hash |
| Generation | OpenRouter BYOK, streaming, free-tier models, mandatory chunk citations |
| Graph | D3 force layout — nodes are notes, edges are shared tags or note-vector cosine |
| Storage | localStorage (notes, settings, feedback) + IndexedDB (vectors, eval runs) |
| Sanitization | Marked + DOMPurify for all rendered markdown |

Why these trade-offs were chosen over the alternatives: [`docs/DECISIONS.md`](docs/DECISIONS.md)

## Run it locally

```bash
git clone https://github.com/sillanaresh/lumen.git
cd lumen
python3 -m http.server 8000
```

Open `http://localhost:8000`. (A server is required — the app uses ES modules and fetches `benchmark.json`.)

- Tests: open `http://localhost:8000/test.html` — 23 checks on the pure pipeline.
- Manual walkthrough: [`TESTING.md`](TESTING.md)

## Deploy

- **GitHub Pages:** serve the repo root. Already live.
- **Vercel:** import the repo, framework preset *Other*, no build command, output directory `.`. [`vercel.json`](vercel.json) sets clean static headers.

## Roadmap

- Per-embedder calibration of the no-answer confidence gate — the experiments above showed thresholds don't transfer between embedding models.
- Benchmark cases over imported PDFs — long-document retrieval is where chunking earns its keep.
- Optional sync to a user-owned folder, keeping the no-server promise.

Shipped from earlier roadmaps: generation-quality evals (citation precision, LLM-judged faithfulness, refusal scoring), the Benchmark Builder for custom corpora, and selectable local embedding models.

---

Built by [Naresh Silla](https://github.com/sillanaresh) as an AI product portfolio project. MIT License.

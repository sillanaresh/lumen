# Lumen 2.0 Eval Report

Lumen 2.0 adds a public, client-side retrieval benchmark at `#eval`.

## Benchmark

- Corpus: 12 seeded learning-science notes
- Cases: 58 total
- Coverage: single-hop, multi-hop, and no-answer questions
- Artifact: [`benchmark.json`](../benchmark.json)

## What It Measures

| Metric | Meaning |
|---|---|
| Hit@1 | Whether the first retrieved chunk belongs to a gold note |
| Hit@5 | Whether any top-5 chunk belongs to a gold note |
| MRR | How early the first correct source appears |
| Whole-note Hit@5 | Baseline from the older note-level retriever |
| Lift | Difference between chunked retrieval and whole-note retrieval |
| No-answer accuracy | Whether unrelated questions avoid confident retrieval |

## Experiments To Run

1. Fast eval: lexical retrieval only, no API key required.
2. Semantic eval: local MiniLM embeddings plus lexical score blend.
3. Ask eval: manually inspect generated answers with chunk-level citations after adding an OpenRouter key.

## README Table Template

Paste exported Markdown from the Quality Lab here after running the benchmark:

| Run | Chunking | Mode | Cases | Hit@1 | Hit@5 | MRR | Whole-note Hit@5 | Lift | No-answer |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| local smoke | chunked | lexical | 58 | 80% | 100% | 0.89 | 100% | 0% | 75% |

The seeded corpus is intentionally small and short, so whole-note hit@5 is already saturated. The useful signal in this run is failure visibility: hit@1, MRR, per-case misses, and no-answer accuracy. Chunking becomes more important for long PDF and URL imports.

## Product Judgment

The point of this benchmark is not to claim perfect RAG. It makes retrieval failures visible enough to debug. A hiring manager can see the corpus, the cases, the scoring method, the misses, and the exact prompt sent to the model.

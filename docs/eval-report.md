# Lumen eval report — benchmark v2.0

**Date:** 2026-06-11 · **Corpus:** `learning-science-v2` (12 seeded notes → 12 chunks) ·
**Runner:** the same `pipeline.js` functions the Ask feature calls, executed via the Eval Lab
(and reproduced headlessly in Node for this report).

## Benchmark design

58 cases, authored against the corpus **before** retrieval tuning:

| Category | Cases | What it tests |
|---|---:|---|
| single-hop | 43 | answer lives in one note |
| multi-hop | 7 | answer spans 2–3 notes |
| no-answer | 8 | **hallucination traps** — correct behavior is to decline |

Each answerable case lists gold note IDs and a human rubric. No-answer cases cover
out-of-domain facts (geography, sports), adjacent-sounding domains (DevOps, OAuth),
and unsafe-to-improvise domains (medical, tax).

Metrics: Hit@1, Hit@5, MRR over answerable cases; no-answer accuracy = share of traps
where the confidence gate correctly refuses; latency p50/p95 of the full retrieval call.

## Results — lexical mode, top-k 5

| Run | Mode | Top-k | Cases | Hit@1 | Hit@5 | MRR | Whole-note Hit@5 | Lift | No-answer | p50 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2026-06-11 | lexical | 5 | 58 | 76% | 98% | 0.86 | 98% | +0% | 75% | <1ms |

Semantic mode (0.72·MiniLM cosine + 0.28·lexical) runs in-app via Eval Lab → mode →
*semantic + lexical*; it requires the one-time 22 MB model download, so it isn't reproduced
in this static report. Run it and use *Export Markdown* to extend this table.

## Failure analysis (the interesting part)

**Misses (answerable):**
- `e50` — *"Which notes explain why discomfort can be a sign that learning is working?"* (gold: n02, n04, n05) — the only full miss. The query's strong tokens (*learning*, *working*, *notes*) hit the **titles** of unrelated notes ("Learning in public") harder than the gold notes' *bodies*, where "discomfort" actually lives. Classic lexical weakness on multi-hop, paraphrased queries; the case exists to give semantic mode something to prove.
- 11 cases land at rank 2–3 instead of 1 (e.g. `e26` Ebbinghaus → "Spaced repetition" outranks "Why we forget"). All still Hit@5.

**No-answer traps that fooled the gate (2/8):**
- `e54` — *"Which OpenRouter model is cheapest today?"* → token **"model"** matches the title "Mental **models** as retrieval scaffolds", scoring 0.90 — far above the 0.2 gate. Title matches carry 2.6× weight, so a single overlapping title token can defeat the gate.
- `e56` — *"What is the best treatment for a sprained ankle?"* → **"best"** appears in the curiosity note's body ("the **best** analogies"), scoring 0.25 — marginally above the gate.

**What this implies (next experiments, in order):**
1. Require ≥2 matching content tokens (or a phrase match) before a title-only match can clear the no-answer gate — should fix `e54` without hurting recall.
2. Stopword-tier common adjectives (*best*, *good*) in the gate path — targets `e56`.
3. Measure semantic mode's no-answer accuracy: cosine against unrelated corpora should sit well below the 0.30 semantic gate, but that's a claim to **measure, not assert**.

## Threats to validity

- **Corpus is small and self-authored.** 12 short notes mean chunked == whole-note retrieval (1 chunk/note), so this benchmark cannot demonstrate chunking lift; it demonstrates ranking and refusal quality. A PDF-based case set is the roadmap item that fixes this.
- **Benchmark and product share an author.** Questions were written before tuning, but not by a third party.
- **Generation quality is not yet scored.** Citation precision exists in `pipeline.js`; faithfulness judging (LLM-as-judge) is roadmap — current numbers are retrieval-only and say nothing about answer wording.

## Reproduce

1. Open the app → Eval Lab → *Run benchmark* (lexical needs no key/model).
2. Or headless-ish: `test.html` validates the pipeline functions; the Lab persists every run to IndexedDB with config + per-case detail, and *Export JSON* gives the raw artifact.

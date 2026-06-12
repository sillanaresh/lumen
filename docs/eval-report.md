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

## Results — five experiments

| Run | Mode | Top-k | Cases | Hit@1 | Hit@5 | MRR | Whole-note Hit@5 | Lift | No-answer | p50 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2026-06-12 | lexical | 3 | 58 | 76% | 98% | 0.86 | 98% | +0% | 75% | <1ms |
| 2026-06-12 | lexical | 5 | 58 | 76% | 98% | 0.86 | 98% | +0% | 75% | <1ms |
| 2026-06-12 | lexical | 8 | 58 | 76% | 98% | 0.86 | 98% | +0% | 75% | <1ms |
| 2026-06-12 | semantic · MiniLM | 5 | 58 | 86% | 100% | 0.92 | 98% | +2% | 100% | 2ms |
| 2026-06-12 | semantic · BGE-small | 5 | 58 | 84% | 100% | 0.92 | 98% | +2% | 50% | 4ms |

All five reproduce headlessly via the same `pipeline.js` functions the app ships (semantic
runs use transformers.js with the exact in-app models).

### Experiment findings

1. **Top-k is a no-op at this corpus size.** With 12 chunks, the gold chunk is either found
   early or not at all — k=3/5/8 are identical. Expect k to matter only on large imports.
2. **Semantic mode is the real upgrade**: Hit@1 76→86%, MRR 0.86→0.92, and refusal accuracy
   75→100%. Both lexical-gate failures (`e54` *"model"* → *Mental models* title; `e56`
   *"best"* in a body) vanish — unrelated questions sit far below the 0.30 cosine gate.
3. **The "better" embedder regressed on refusal — the headline lesson.** BGE-small ranks as
   well as MiniLM (Hit@1 84%, MRR 0.92) but its refusal accuracy is **50%**: BGE's cosine
   scores run systematically hotter (and it expects a query-instruction prefix Lumen doesn't
   send), so the no-answer threshold calibrated on MiniLM lets 4 of 8 traps through.
   **Confidence thresholds do not transfer across embedders.** Consequences shipped: the
   embedder is user-selectable, every run records which embedder produced it, and the compare
   view makes the regression visible before anyone trusts an upgrade. Per-embedder threshold
   calibration is the follow-up on the roadmap.

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

## Generation metrics (BYOK)

With an OpenRouter key, the Lab also generates an answer per case and scores: **citation
precision** (share of citations pointing at gold notes), **faithfulness** (the user's model
judges the answer against the retrieved context, 1–5, strict JSON, fences stripped, one
retry; unparseable verdicts are excluded and counted), and **generation refusal** (the system
prompt mandates an exact decline sentence, detected deterministically). These depend on which
generator/judge the user picked, so they're recorded per run rather than published here.
Self-grading bias of same-model-as-judge is acknowledged in DECISIONS.md (D-015).

## Threats to validity

- **Corpus is small and self-authored.** 12 short notes mean chunked == whole-note retrieval (1 chunk/note), so this benchmark cannot demonstrate chunking lift; it demonstrates ranking and refusal quality. A PDF-based case set is the roadmap item that fixes this.
- **Benchmark and product share an author.** Questions were written before tuning, but not by a third party.
- **Synthetic custom benchmarks flatter retrieval.** Builder-drafted questions share vocabulary with their source chunk despite the paraphrase instruction; custom runs are labeled and never compared against the hand-written set.
- **The no-answer threshold is MiniLM-calibrated.** As experiment 3 shows, it does not transfer to other embedders; treat refusal numbers as per-embedder.

## Reproduce

1. Open the app → Eval Lab → *Run benchmark* (lexical needs no key/model).
2. Or headless-ish: `test.html` validates the pipeline functions; the Lab persists every run to IndexedDB with config + per-case detail, and *Export JSON* gives the raw artifact.

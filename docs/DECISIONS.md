# Lumen — product decision log

Decisions that shaped Lumen 2.0, with the alternatives that were rejected and why.
Newest first. The point of this file: AI product quality is mostly *choices*, and
choices should be inspectable — same as answers.

---

## D-017 · The user picks the embedding model, and the eval referees the choice

**Decision:** Three local embedders in Settings — MiniLM (22 MB), BGE-small (34 MB), BGE-base (110 MB). Vectors are cached per model; saved eval runs record which embedder produced them, so the upgrade question ("is 5× the download worth it?") is answered by the compare view, not by vibes.

**Alternative rejected:** Server-side embeddings — better quality ceiling, but it costs the maker money per user and breaks the only promise that differentiates the product (notes never leave the browser).

## D-016 · Custom benchmarks: provenance is the gold label, humans approve everything

**Decision:** The Benchmark Builder drafts each question *from a specific chunk*, so the gold answer is established by provenance — the drafting model never judges correctness. Every case is human-approved (edit/exclude) before it counts; users can also upload their own JSON (validated against the workspace). Refusal traps come from an out-of-corpus pool.

**Bias acknowledged, not hidden:** LLM-phrased questions share vocabulary with their source, which flatters retrieval. Mitigations: the draft prompt demands paraphrase, custom runs are labeled and never compared against the hand-written set, and uploading human-authored cases remains the trustworthy path.

## D-015 · Faithfulness judging: strict JSON, defensive parsing, failures shown

**Decision:** Generation metrics use the user's own model as judge (score 1–5 against the retrieved context, strict JSON, fences stripped, one retry). Unparseable verdicts are marked `judge_error`, excluded from the average, and **counted visibly** in the tile. Refusal detection doesn't use the judge at all — the system prompt mandates an exact decline sentence, so it's a deterministic string check.

**Alternatives rejected:** A separate hardcoded judge model (dies the same death as the hardcoded model list, D-013) and free-text judging (unscoreable). Same-model-as-judge has self-grading bias — accepted and disclosed, because BYOK means there is no neutral third model to insist on.

## D-014 · Light theme is the default

**Decision:** Two themes from one token set — warm paper (default) and deep night — with a persisted toggle, applied before first paint.

**Why light default:** This product gets evaluated in screen-shares, offices, and recruiter laptops, where dark UIs read as hobby-project. Light-first also forces honesty in the design system: glows and glass that only work on black are decoration, not design. Amber survives both — as ink on paper, as light at night.

## D-013 · The model list is fetched live, never hardcoded

**Decision:** Settings fetches OpenRouter's public model catalog on open (plain GET, disclosed in the privacy list), shows all current free models, and offers a custom-ID field for any paid model. A small static list backstops offline use; retired saved models migrate to the default.

**Why (a lesson, not a guess):** The v0.x hardcoded list aged into being *wrong* — two of its four models no longer existed on OpenRouter within months, which means a fresh user's first generation request would simply fail. Model catalogs churn weekly; shipping a frozen list is shipping a future bug. The catalog endpoint needs no key and carries no user data, so the privacy cost is one disclosed GET.

**Cost accepted:** One more outbound flow to explain, and the dropdown quality depends on OpenRouter's metadata. The free-models-only grouping is deliberate: users with credits know their model ID; new users should not be one click from a surprise bill.

## D-012 · Refuse before generating, not after

**Decision:** The no-answer gate runs on local retrieval scores *before* any model call. Below threshold, Lumen renders "Your notes don't seem to cover this" with a link to the evidence and an explicit "Ask the model anyway" override.

**Alternatives rejected:**
- *Prompt-only refusal* ("if context is insufficient, say so") — measured to be unreliable across free-tier models, and it costs a round-trip even when it works.
- *Hard refusal with no override* — too paternalistic; the user may know their phrasing is odd and want the model's judgment anyway.

**Cost accepted:** A threshold is a blunt instrument; some answerable-but-oddly-phrased questions get gated. The benchmark's no-answer accuracy metric exists precisely to tune this trade-off, and the override keeps the user in control.

## D-011 · The eval imports the production pipeline

**Decision:** `views/ask.js` and `views/lab.js` call the same pure functions from `pipeline.js` (`rankChunks`, `isNoAnswer`, `buildPrompt`). The benchmark cannot drift from the product.

**Alternative rejected:** A separate eval script (Node/Python) — easier to extend, but it measures a *copy* of the system. Copies drift silently; the headline numbers stop being true.

## D-010 · Full rewrite over incremental upgrade for 2.0

**Decision:** Rebuild from scratch: app-first shell, ES modules, hand-rolled CSS. v0.x (a 3,000-line single file with the app embedded in a marketing page) is preserved in git history.

**Why:** Three structural problems couldn't be patched out: (1) the product lived in a 72vh box inside a scrolling landing page — it read as a demo, not a product; (2) the Tailwind CDN throws a "not for production" console warning, which is exactly what a technical reviewer sees first; (3) a single 150 KB file made the codebase — itself a portfolio artifact — unreviewable.

**Cost accepted:** ES modules mean the app needs an HTTP server (no `file://`). Acceptable: every deploy target serves HTTP, and `python3 -m http.server` is one line.

## D-009 · App-first; the pitch lives in About + README

**Decision:** Lumen opens as a full-viewport product (graph view). The story for evaluators is a first-class *About* view plus this repo's docs — not a hero section wrapping the app.

**Why:** The strongest pitch for a product is the product behaving like one. Tools people respect (Linear, Obsidian) don't make you scroll past their marketing to use them.

## D-008 · BYOK instead of a free backend proxy

**Decision:** Bring-your-own OpenRouter key; the app has no server.

**Alternatives rejected:** A proxy with a shared key (costs money, gets abused, holds user content in transit) or a freemium backend (accounts, database — kills the privacy story).

**Cost accepted:** Real onboarding friction. Mitigations: retrieval-only mode works fully without a key, the key flow is documented in-context, and a "test key" button removes the guesswork.

## D-007 · Chunks are citations; notes are nodes

**Decision:** Retrieval and citations operate on ~300-token chunks (`[n02.1]`); the graph renders whole notes only. Note-level semantic edges use the mean of chunk vectors.

**Alternative rejected:** Chunk-level graph nodes — visually impressive for a demo, unreadable for actual navigation at >100 chunks.

**Why mean-of-chunks over max-pair similarity:** max-pair is more sensitive but O(chunks²) per edge refresh and noisier on short notes; mean-of-chunks is one vector per note and stable. Revisit if long documents dominate workspaces.

## D-006 · ~300-token chunks, 15% overlap, markdown-aware

**Decision:** Split on heading structure first, merge small siblings up to ~1200 chars, hard-split oversized paragraphs at sentence boundaries (`Intl.Segmenter`, regex fallback), never split inside a code fence. Constants exported from `pipeline.js` so experiments stay one-line changes.

**Alternative rejected:** Fixed-size sliding windows — simpler, but citations stop aligning with how humans structured the note, and a citation that opens mid-sentence erodes exactly the trust the product sells.

## D-005 · Blend 0.72 semantic / 0.28 lexical, linear scan, no vector DB

**Decision:** Score = 0.72·cosine + 0.28·keyword. Brute-force Float32Array scan.

**Why:** Lexical rescues exact-term queries where MiniLM is weak (names, jargon), and pure-lexical is the graceful degradation path when the model can't load. At ≤ a few thousand chunks, a linear scan is <10 ms — a vector DB would be résumé-driven engineering.

## D-004 · No-answer traps are a headline metric

**Decision:** 8 of 58 benchmark cases have *no* answer in the corpus; the correct behavior is to decline. Tracked as "no-answer accuracy" beside Hit@k and MRR.

**Why:** Retrieval hit rate measures what the system knows. No-answer accuracy measures whether it knows what it *doesn't* know — which is the failure mode that actually destroys user trust in RAG products. Few tools publish it; that's the wedge.

## D-003 · Honest privacy copy

**Decision:** Never claim "nothing leaves your browser." Settings and About enumerate exactly three outbound flows (Ask → OpenRouter, URL import → r.jina.ai, feedback → GitHub draft).

**Why:** One discoverable overclaim poisons every other claim the product makes. Precision is the brand.

## D-002 · Feedback is local-first with transparent export

**Decision:** Thumbs and per-chunk relevance labels persist locally. "Send to maker" opens a pre-filled GitHub issue the user sees before posting. Nothing auto-sends.

**Alternative rejected:** A telemetry endpoint — even a privacy-respecting one contradicts the no-server promise and would need consent UX disproportionate to its value at this scale.

## D-001 · Zero build step

**Decision:** No bundler, no framework, no `node_modules`. Vanilla ES modules + four CDN libraries (D3, Marked, DOMPurify, pdf.js; transformers.js lazy-loaded).

**Why:** The deploy story is "serve this folder." Anyone can View-Source the whole product. For a portfolio project whose audience includes engineers, reviewability is a feature.

**Cost accepted:** No TypeScript, no tree-shaking, manual DOM wiring. At ~3k LOC this stays manageable; the typed-core discipline lives in `pipeline.js` being pure and unit-tested instead.

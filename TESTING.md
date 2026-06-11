# Lumen 2.0 Testing Walkthrough

Run locally:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Smoke Test

1. Load the app. Confirm the onboarding modal appears on first visit.
2. Step through onboarding. Confirm it switches Graph, Ask, and Evals modes.
3. Open Graph. Confirm seeded notes render as nodes and tag edges.
4. Search `sleep`. Confirm unrelated nodes dim.
5. Open Notes. Click at least two notes and confirm connections update.
6. Open Ask with no API key. Ask `How should I space my study sessions?`.
7. Confirm retrieval-only result appears with ranked chunks and the exact prompt.
8. Click a retrieved chunk. Confirm the parent note opens and a cited chunk callout appears.
9. Add an OpenRouter key in Settings if available. Ask again and confirm streaming answer cites chunk IDs such as `[n02.1]`.
10. Click an answer citation. Confirm the note opens with the cited chunk callout.
11. Press Thumbs up/down. Confirm Settings shows a feedback event.
12. Export feedback JSON from Settings.
13. Open Import, choose PDF. Confirm text PDFs show a preview before saving.
14. Try a scanned/image PDF. Confirm the error explains that Lumen cannot read scanned PDFs yet.
15. Paste a public URL. Confirm copy says the URL is fetched via `r.jina.ai`.
16. Save an import. Confirm it appears in the graph and Notes list.
17. Import the same content again. Confirm duplicate warning appears.
18. Open `http://localhost:8000/#eval`.
19. Run fast eval. Confirm hit@1, hit@5, MRR, lift, no-answer metric, and per-case drilldowns render.
20. Export eval JSON.
21. Export eval Markdown and confirm the table is README-ready.
22. Run semantic eval. Confirm local AI status shows loading/ready and the run either completes or fails with a clear model-download explanation.
23. Open Settings. Confirm privacy section lists Ask, URL import, and local-only data.
24. Clear embedding cache. Confirm AI vectors are recomputed on next semantic use.
25. Resize to mobile width. Confirm graph read-mode message appears and Notes/Ask remain usable.

## Error States

- Bad API key: paste an invalid OpenRouter key and ask a question. Expected: the answer card shows the OpenRouter error without losing retrieved chunks.
- Network failure: go offline and run semantic search/eval. Expected: semantic path errors clearly or falls back to lexical retrieval.
- URL blocked: import a URL that requires login. Expected: reader-service failure copy suggests trying another URL.
- Empty/scanned PDF: import an image-only PDF. Expected: no empty note is created.

## Regression Focus

- Chunk IDs must remain stable for unchanged note text.
- Ask and Evals must use the same `rankPassages` and `buildPrompt` pipeline.
- Notes and embeddings must remain local unless the user explicitly asks a question via OpenRouter, imports a URL, exports data, or opens the GitHub issue draft.

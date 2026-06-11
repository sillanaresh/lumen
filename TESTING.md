# Lumen — manual test walkthrough

Automated coverage: open `test.html` (23 unit checks on the pure pipeline). This
walkthrough covers the stateful/UI paths the unit tests can't. Run against
`python3 -m http.server 8000` → `http://localhost:8000`.

Reset between full passes: Settings → *Reset workspace…* → type `RESET`, and
clear site data for a true first-run.

## First run & onboarding
1. Open the app in a clean profile → 3-step welcome tour appears. *Skip tour* dismisses it permanently (reload to confirm it stays gone).
2. Default view is the Graph with 12 seeded notes; stats line shows notes/links/chunks.

## Graph
3. Drag a node; hover shows a preview card; click opens the note in Library.
4. Toggle *Semantic links* → AI pill shows download progress → edges re-render with cosine labels. (Offline: a toast reports the failure and tag links keep working.)
5. *List view* shows the screen-reader alternative with per-note link lists.

## Library
6. Select notes; filter by search text and by tag chip (toggle off again).
7. The right rail shows Connections, Semantic neighbors (after model load), and the Chunk map. Clicking a chunk-map row highlights that chunk above the note with a fading callout.
8. *New note* → save with a `# heading` and ~2 paragraphs → toast confirms, note appears in list/graph, chunk map shows ≥1 chunk. Edit it; delete it (confirm dialog).
9. Edit a *seeded* note → Eval Lab later shows the corpus-drift warning.

## Ask — happy paths
10. With no API key: ask "How should I space my study sessions?" → retrieval-only card with *Add API key* CTA; Evidence rail shows steps 1–4 with step 4 "not run — no API key set".
11. Add a key (Settings → *test key* → ✓) → ask again → answer streams, citations render as chips; clicking `[n02.1]` opens the note scrolled to the highlighted chunk; sources row lists cited chunks.
12. Evidence rail: scores + bars per chunk, exact prompt expands, token estimate present. Mark a chunk *relevant?* yes/no → toast confirms a local label.
13. Thumbs up/down on an answer → "Saved locally"; Settings shows the feedback count; *Export JSON* downloads it; *Send to maker* opens a pre-filled GitHub issue (verify no API key anywhere in the payload).

## Ask — refusal & errors
14. Ask "What is the capital of Finland?" → no-answer card ("Your notes don't seem to cover this"), with working *See what was searched* and *Ask the model anyway*.
15. 401: save key `sk-or-invalid` → ask → error card names the bad key and links to Settings.
16. Network: go offline (devtools) → ask (force past the gate if needed) → network error card with *Retry*; retry works after going online.
17. 429: hammer a free model repeatedly → rate-limit card with wait/switch-model guidance.
18. *Stop generating* mid-stream → card shows the partial answer as cancelled.

## Eval Lab
19. *Run benchmark* (lexical) → progress bar, then 6 metric tiles populate; per-case rows filterable by All/Misses/No-answer; a row expands to gold notes, rubric, and retrieved chunks with scores; chunk chips open the source note.
20. Run again in semantic mode (model downloads if needed) → both runs in history; tick two checkboxes → delta table with green/red deltas; *Cancel* mid-run saves a partial run badged in the metrics tile.
21. *Export JSON* and *Export Markdown* download; the Markdown table matches the README format.
22. With a drifted corpus (step 9): warning banner with *Reset corpus to benchmark* → resets and clears the warning.

## Import
23. PDF: drop a text-based PDF → parsing progress → editable preview → *Add to workspace* → toast with *Open note*; note is chunked and in the graph. Re-import the same file → duplicate warning. A scanned/image PDF → "appears to be scanned images" error, no empty note created.
24. URL: paste an article URL → fetched via r.jina.ai → preview → save. A bogus URL → friendly failure message.

## Shell
25. ⌘K palette: type a word from a note → note results navigate; commands (Run benchmark, Settings, New note) work; arrow keys + Enter navigate. Legacy hash `#eval` redirects to the Eval Lab. Narrow window (<920px): bottom nav appears, graph is replaced by a notice, Library/Ask/Lab remain usable.

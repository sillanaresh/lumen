# Lumen — 3-minute demo script

For interviews and the demo video. Practice the transitions; the demo is the
thesis ("local-first, transparent, measured") told three times in increasing depth.

**Setup beforehand:** fresh browser profile (so onboarding shows), OpenRouter key in
clipboard, one text-based PDF on the desktop, one eval run already saved in history.

---

**0:00 — Open on the Graph.**
> "This is Lumen — a notes app where the AI has to show its work. Twelve seeded notes
> on learning science; notes are dots, shared ideas are lines. Everything you'll see —
> embeddings, retrieval, evals — runs in this browser tab. There's no server."

Drag a node. Flip *Tag links → Semantic links*; point at the AI pill loading.
> "That's a 22-megabyte embedding model downloading into the page. Meaning-based
> links, computed locally."

**0:35 — Ask, the happy path.**
Ask: *"What's the difference between active recall and spaced repetition?"*
> "Watch the right rail, not the answer. Before any model is involved: which chunks
> were retrieved, the cosine and keyword score per chunk, and the exact prompt that
> leaves the machine. The answer must cite chunks —"

Click a `[n01.1]` citation → note opens at the highlighted passage.
> "— and a citation lands on the passage, not just a document. That's what makes it checkable."

**1:15 — The refusal.**
Ask: *"What is the capital of Finland?"*
> "The notes don't cover this, and Lumen says so — locally, before spending a model
> call — because the best retrieved chunk is below the confidence gate. Hallucination
> resistance as a product behavior, not a prompt suggestion. And the override is right
> there, because the user stays in charge."

**1:45 — Import.**
Drop the PDF → preview → add.
> "PDFs parse in-browser, get chunked into citable passages, and join the graph.
> This is where chunking earns its keep — one vector per 30-page document is how
> RAG quality quietly dies."

**2:10 — The Eval Lab (the close).**
Open Eval Lab; show metric tiles, then the no-answer filter; expand a failing case.
> "I don't claim it works — I measured it. Fifty-eight cases shipped with the app,
> including eight trick questions whose correct answer is 'I don't know.' Current
> no-answer accuracy is 75%, and here's exactly which questions fool the gate and why —
> the word 'model' in 'cheapest model' matches a note called *Mental models*. The
> runner calls the same functions the Ask feature calls, so these numbers can't
> drift from the product."

Show two runs in compare; the delta table.

**2:50 — Close.**
> "Local-first, transparent, measured. The bet is that AI products earn trust by
> being auditable — and every design decision in here, including the rejected
> options, is written up in the repo."

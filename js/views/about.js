// views/about.js — the product story. Written for two readers: a curious user,
// and the AI-product person evaluating whether Lumen's maker thinks in evals,
// tradeoffs, and trust.

export function render(root) {
  root.innerHTML = `
  <div class="about">
    <section class="about-hero">
      <div class="kicker">About Lumen</div>
      <h1>Private notes AI,<br/>measured in the open.</h1>
      <p class="about-lede">Most AI note tools ask you to trust a black box. Lumen is built on the opposite bet:
      <strong>an AI product earns trust by showing its work and publishing its numbers.</strong></p>
      <div class="about-pillars">
        <div class="pillar">
          <div class="pillar-k mono">local-first</div>
          <p>Notes, embeddings, eval runs, and your API key live in this browser. No account, no server, no tracking. Semantic search runs on a 22&nbsp;MB model <em>inside the page</em>.</p>
        </div>
        <div class="pillar">
          <div class="pillar-k mono">transparent</div>
          <p>Every answer ships with evidence: the retrieved chunks and their scores, the exact prompt that left the machine, the token count, the cost. When the notes don't cover a question, Lumen says so instead of improvising.</p>
        </div>
        <div class="pillar">
          <div class="pillar-k mono">measured</div>
          <p>The Eval Lab runs a published benchmark — including no-answer traps that test hallucination resistance — against the same pipeline that powers Ask, and saves every run so changes are judged, not guessed.</p>
        </div>
      </div>
    </section>

    <section class="about-section">
      <h2>How an answer is made</h2>
      <ol class="about-steps">
        <li><strong>Chunk.</strong> Notes and imports are split on markdown structure into ~300-token chunks with 15% overlap. Each chunk has a stable, citable ID like <span class="mono">[n02.1]</span>.</li>
        <li><strong>Embed.</strong> MiniLM-L6-v2 runs in-browser via transformers.js; vectors are cached locally by content hash, so unchanged text is never re-embedded.</li>
        <li><strong>Retrieve.</strong> A blend of cosine similarity (0.72) and keyword scoring (0.28) ranks every chunk. If even the best chunk is weak, Lumen declines to answer.</li>
        <li><strong>Generate.</strong> Only with your OpenRouter key: the retrieved chunks — exactly the ones in the Evidence panel — go to the model you chose, and the answer must cite chunk IDs.</li>
      </ol>
    </section>

    <section class="about-section">
      <h2>What leaves your machine</h2>
      <p class="dim">"Local-first" is a precise claim, not a slogan. Exactly three actions send data out, all user-initiated:</p>
      <table class="about-table">
        <thead><tr><th>Action</th><th>What is sent</th><th>To whom</th></tr></thead>
        <tbody>
          <tr><td>Ask (with API key)</td><td>The retrieved chunks shown in the Evidence panel + your question</td><td>OpenRouter, with your key, to your chosen model</td></tr>
          <tr><td>URL import</td><td>The URL you paste</td><td>r.jina.ai, which fetches a readable copy</td></tr>
          <tr><td>Send feedback</td><td>A GitHub issue draft you see before posting</td><td>GitHub, only if you submit it</td></tr>
        </tbody>
      </table>
      <p class="dim">Everything else — notes, PDFs (parsed in-browser), embeddings, eval runs, feedback, your key — stays here. Clear site data and it's gone.</p>
    </section>

    <section class="about-section">
      <h2>Product decisions worth defending</h2>
      <div class="decision-grid">
        <div class="decision">
          <h3>Refuse before generating, not after</h3>
          <p class="dim">The no-answer gate runs on retrieval scores, locally, before any model call. Saying "your notes don't cover this" is cheaper, faster, and more honest than asking a model not to hallucinate and hoping.</p>
        </div>
        <div class="decision">
          <h3>The eval measures the real pipeline</h3>
          <p class="dim">Ask and the Eval Lab import the same pure functions. An eval of a copy of your system measures the copy; this one can't drift from production because it <em>is</em> production.</p>
        </div>
        <div class="decision">
          <h3>BYOK instead of a free backend</h3>
          <p class="dim">A proxy server would mean holding user content and keys. Bring-your-own-key keeps the privacy story airtight and the architecture serverless — the right trade for a trust-first product, accepting the onboarding friction.</p>
        </div>
        <div class="decision">
          <h3>Notes are nodes; chunks are citations</h3>
          <p class="dim">The graph stays human-scaled (notes), while retrieval works at machine scale (chunks). Mixing the two made the graph unreadable; separating them keeps both honest.</p>
        </div>
      </div>
      <p class="dim">The full decision log, including rejected alternatives, lives in <a href="https://github.com/sillanaresh/lumen/blob/main/docs/DECISIONS.md" target="_blank" rel="noopener">docs/DECISIONS.md</a>.</p>
    </section>

    <section class="about-section">
      <h2>Roadmap</h2>
      <ul class="about-roadmap">
        <li><span class="mono dim">next</span> Generation-quality evals: citation precision and LLM-as-judge faithfulness scoring, run from the Eval Lab with your key.</li>
        <li><span class="mono dim">next</span> Benchmark cases over imported PDFs (long-document retrieval is where chunking earns its keep).</li>
        <li><span class="mono dim">later</span> Optional sync to a user-owned folder — keeping the no-server promise.</li>
      </ul>
    </section>

    <footer class="about-foot">
      <p>Built by <strong>Naresh Silla</strong> as an AI product portfolio project — the thesis is that AI features should be auditable by the people who use them.</p>
      <p class="mono dim">
        <a href="https://github.com/sillanaresh/lumen" target="_blank" rel="noopener">github.com/sillanaresh/lumen</a> · MIT ·
        zero build step · vanilla JS + D3 + transformers.js · no analytics in this app
      </p>
    </footer>
  </div>`;
}

// views/ask.js — cited Q&A over the workspace, with the Evidence rail.
//
// The rail is the product thesis made visible: for any answer you can see the
// retrieval mode, every candidate chunk with its scores, the exact prompt that
// left the browser, and what it cost. Nothing hidden.

import { state, loadSettings, addFeedback, embedder } from '../store.js';
import { rankChunks, buildPrompt, isNoAnswer, parseCitations, estimateTokens, DEFAULT_TOP_K } from '../pipeline.js';
import { streamChat, AskError, ERROR_HELP } from '../openrouter.js';
import { escapeHtml, renderMarkdown, scoreBar, toast, fmtMs } from '../ui.js';
import { openNote } from './library.js';
import { openSettings } from '../app.js';

let selectedId = null;   // record shown in the evidence rail
let activeAbort = null;

const SUGGESTIONS = [
  "What's the difference between active recall and spaced repetition?",
  'Why does deliberate practice work?',
  'How does sleep affect what I remember?',
  'What is the capital of Finland?', // deliberately unanswerable — shows the honest refusal
];

export function render(root) {
  root.innerHTML = `
    <div class="ask-layout">
      <main class="ask-main">
        <div id="ask-thread" class="ask-thread" aria-live="polite"></div>
        <div class="ask-composer">
          <div class="ask-composer-inner">
            <textarea id="ask-input" rows="1" class="input ask-input" placeholder="Ask your notes…" aria-label="Ask a question"></textarea>
            <button id="ask-send" class="btn btn-primary">Ask</button>
          </div>
          <div class="ask-composer-hint dim">
            <span>Enter to send · answers cite chunks like <span class="mono">[n01.2]</span></span>
            <span id="ask-mode-hint" class="mono"></span>
          </div>
        </div>
      </main>
      <aside class="pane pane-right ask-rail" id="ask-rail" aria-label="Evidence"></aside>
    </div>
  `;
  const input = root.querySelector('#ask-input');
  const send = () => {
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    autoGrow(input);
    ask(root, q);
  };
  root.querySelector('#ask-send').addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  input.addEventListener('input', () => autoGrow(input));

  renderThread(root);
  renderRail(root);
  updateModeHint(root);
}

function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
}

function updateModeHint(root) {
  const hint = root.querySelector('#ask-mode-hint');
  if (!hint) return;
  const s = loadSettings();
  hint.textContent = s.apiKey ? s.model.split('/').pop() : 'no key · retrieval-only mode';
}

// ---------- The ask pipeline (calls the same pure functions the Eval Lab uses) ----------
async function ask(root, question, { force = false } = {}) {
  const settings = loadSettings();
  const rec = {
    id: 'qa' + Date.now().toString(36),
    question,
    status: 'retrieving',
    mode: 'lexical',
    results: [],
    prompt: null,
    answer: '',
    citations: [],
    error: null,
    relevance: {},        // chunkId → true/false (user labels)
    timings: {},
  };
  state.askHistory.push(rec);
  selectedId = rec.id;
  renderThread(root);
  renderRail(root);

  // 1. Retrieve — semantic when the local model cooperates, lexical otherwise.
  const t0 = performance.now();
  let queryVec = null;
  if (embedder.status !== 'error') {
    try {
      await embedder.ensureIndex();
      queryVec = await embedder.embed(question);
      rec.mode = 'semantic';
    } catch { /* lexical fallback */ }
  }
  rec.timings.embedMs = performance.now() - t0;
  const t1 = performance.now();
  rec.results = rankChunks(question, state.chunks, {
    queryVec, getVec: queryVec ? (c) => embedder.getVec(c) : null, topK: DEFAULT_TOP_K,
  });
  rec.timings.retrieveMs = performance.now() - t1;
  rec.noAnswer = isNoAnswer(rec.results, rec.mode);
  rec.prompt = buildPrompt(question, rec.results);

  // 2. Decide whether to generate.
  if (rec.noAnswer && !force) {
    rec.status = 'no-answer';
    renderThread(root); renderRail(root);
    return;
  }
  if (!settings.apiKey) {
    rec.status = 'retrieval-only';
    renderThread(root); renderRail(root);
    return;
  }

  // 3. Generate with streaming.
  rec.status = 'streaming';
  renderThread(root); renderRail(root);
  const answerEl = root.querySelector(`[data-answer="${rec.id}"]`);
  activeAbort = new AbortController();
  const t2 = performance.now();
  try {
    await streamChat({
      apiKey: settings.apiKey,
      model: settings.model,
      messages: rec.prompt.messages,
      signal: activeAbort.signal,
      onToken: (_, total) => {
        rec.answer = total;
        if (answerEl) {
          answerEl.innerHTML = escapeHtml(total).replace(/\[([a-z][a-z0-9_]*\.\d+)\]/gi,
            '<span class="cite-inline mono">[$1]</span>') + '<span class="caret"></span>';
        }
      },
    });
    rec.status = 'done';
    rec.citations = parseCitations(rec.answer);
    rec.timings.genMs = performance.now() - t2;
    rec.outputTokens = estimateTokens(rec.answer);
  } catch (err) {
    if (err.name === 'AbortError') { rec.status = 'cancelled'; }
    else {
      rec.status = 'error';
      rec.error = err instanceof AskError ? err : new AskError('api', String(err.message || err));
    }
  } finally {
    activeAbort = null;
    renderThread(root); renderRail(root);
  }
}

// ---------- Thread ----------
function renderThread(root) {
  const thread = root.querySelector('#ask-thread');
  if (!thread) return;
  if (!state.askHistory.length) {
    thread.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-art">✺</div>
        <h2>Ask your notes anything</h2>
        <p>Lumen retrieves the most relevant chunks locally, shows you exactly what would be sent to a model, and answers with citations back to your notes. If your notes don't cover it, it says so.</p>
        <div class="suggest-row">
          ${SUGGESTIONS.map(q => `<button class="btn btn-ghost btn-sm suggest" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('')}
        </div>
      </div>`;
    thread.querySelectorAll('.suggest').forEach(b => b.addEventListener('click', () => ask(root, b.dataset.q)));
    return;
  }

  thread.innerHTML = state.askHistory.map(rec => qaCard(rec)).join('');
  wireThread(root, thread);
  thread.scrollTop = thread.scrollHeight;
}

function qaCard(rec) {
  const sel = rec.id === selectedId;
  let body = '';
  switch (rec.status) {
    case 'retrieving':
      body = `<div class="dim"><span class="spinner"></span> Retrieving from ${state.chunks.length} chunks…</div>`;
      break;
    case 'streaming':
      body = `<div class="prose ask-answer" data-answer="${rec.id}"><span class="caret"></span></div>
              <button class="btn btn-ghost btn-sm" data-cancel="${rec.id}">Stop generating</button>`;
      break;
    case 'no-answer':
      body = `
        <div class="no-answer">
          <div class="no-answer-title">Your notes don't seem to cover this.</div>
          <p class="dim">The best retrieved chunk scored ${(rec.results[0]?.score ?? 0).toFixed(2)}, below the ${rec.mode} confidence threshold — so Lumen won't ask a model to improvise an answer.</p>
          <div class="btn-row">
            <button class="btn btn-ghost btn-sm" data-evidence="${rec.id}">See what was searched</button>
            <button class="btn btn-ghost btn-sm" data-force="${rec.id}">Ask the model anyway</button>
          </div>
        </div>`;
      break;
    case 'retrieval-only':
      body = `
        <div class="retrieval-only">
          <p>Retrieval ran locally — the ${rec.results.length} chunks in the Evidence panel are what an answer would be built from.</p>
          <p class="dim">Add a free OpenRouter key to synthesize a cited answer. Your key stays in this browser and goes only to OpenRouter.</p>
          <button class="btn btn-primary btn-sm" data-addkey="${rec.id}">Add API key</button>
        </div>`;
      break;
    case 'cancelled':
      body = `<div class="dim">Generation stopped.${rec.answer ? ' Partial answer:' : ''}</div>${rec.answer ? `<div class="prose ask-answer">${citeChips(renderMarkdown(rec.answer))}</div>` : ''}`;
      break;
    case 'error':
      body = `
        <div class="ask-error">
          <div class="ask-error-title">Couldn't generate an answer</div>
          <p class="dim">${escapeHtml(ERROR_HELP[rec.error?.kind] || String(rec.error?.message || 'Unknown error'))}</p>
          <div class="btn-row">
            <button class="btn btn-ghost btn-sm" data-retry="${rec.id}">Retry</button>
            ${rec.error?.kind === 'auth' ? `<button class="btn btn-ghost btn-sm" data-addkey="${rec.id}">Open Settings</button>` : ''}
          </div>
        </div>`;
      break;
    default: { // done
      const sources = rec.citations.map(id => {
        const c = state.chunks.find(x => x.chunkId === id);
        return c ? `<button class="cite-chip" data-open="${escapeHtml(id)}">[${escapeHtml(id)}] ${escapeHtml(c.noteTitle)}</button>` : '';
      }).join('');
      body = `
        <div class="prose ask-answer">${citeChips(renderMarkdown(rec.answer))}</div>
        ${sources ? `<div class="source-row"><span class="dim mono">sources</span>${sources}</div>` : ''}
        <div class="feedback-row">
          <span class="dim">Useful?</span>
          <button class="btn btn-ghost btn-xs" data-fb="up" data-id="${rec.id}" aria-label="Thumbs up">👍 Yes</button>
          <button class="btn btn-ghost btn-xs" data-fb="down" data-id="${rec.id}" aria-label="Thumbs down">👎 No</button>
          <span class="dim" data-fbstatus="${rec.id}">${rec.feedback ? 'Saved locally — thanks.' : ''}</span>
        </div>`;
    }
  }
  return `
    <article class="qa-card ${sel ? 'qa-selected' : ''}" data-card="${rec.id}">
      <header class="qa-head">
        <div class="qa-q">${escapeHtml(rec.question)}</div>
        <button class="evidence-btn mono ${sel ? 'evidence-btn-on' : ''}" data-evidence="${rec.id}"
          title="Show how this answer was made">${rec.mode} · ${rec.results.length} chunks ⓘ</button>
      </header>
      <div class="qa-body">${body}</div>
    </article>`;
}

function citeChips(html) {
  return html.replace(/\[([a-z][a-z0-9_]*\.\d+)\]/gi, (m, id) => {
    const c = state.chunks.find(x => x.chunkId.toLowerCase() === id.toLowerCase());
    return c ? `<button class="cite-chip" data-open="${escapeHtml(c.chunkId)}" title="${escapeHtml(c.noteTitle + ' › ' + c.headingPath)}">[${escapeHtml(c.chunkId)}]</button>` : m;
  });
}

function wireThread(root, thread) {
  thread.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.open;
    openNote(id.split('.')[0], id);
  }));
  thread.querySelectorAll('[data-evidence]').forEach(b => b.addEventListener('click', () => {
    selectedId = b.dataset.evidence;
    renderThread(root); renderRail(root);
  }));
  thread.querySelectorAll('[data-force]').forEach(b => b.addEventListener('click', () => {
    const rec = state.askHistory.find(r => r.id === b.dataset.force);
    state.askHistory = state.askHistory.filter(r => r.id !== rec.id);
    ask(root, rec.question, { force: true });
  }));
  thread.querySelectorAll('[data-retry]').forEach(b => b.addEventListener('click', () => {
    const rec = state.askHistory.find(r => r.id === b.dataset.retry);
    state.askHistory = state.askHistory.filter(r => r.id !== rec.id);
    ask(root, rec.question);
  }));
  thread.querySelectorAll('[data-addkey]').forEach(b => b.addEventListener('click', () => openSettings()));
  thread.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => activeAbort?.abort()));
  thread.querySelectorAll('[data-fb]').forEach(b => b.addEventListener('click', () => {
    const rec = state.askHistory.find(r => r.id === b.dataset.id);
    if (!rec || rec.feedback) return;
    rec.feedback = b.dataset.fb;
    addFeedback({ type: 'answer', question: rec.question, verdict: b.dataset.fb, mode: rec.mode, citations: rec.citations });
    const s = thread.querySelector(`[data-fbstatus="${rec.id}"]`);
    if (s) s.textContent = 'Saved locally — thanks.';
  }));
}

// ---------- Evidence rail ----------
function renderRail(root) {
  const rail = root.querySelector('#ask-rail');
  if (!rail) return;
  const rec = state.askHistory.find(r => r.id === selectedId) || state.askHistory.at(-1);
  if (!rec) {
    rail.innerHTML = `
      <section class="rail-section">
        <h3 class="rail-title">Evidence</h3>
        <p class="dim rail-empty">Every answer comes with receipts. Ask something and this panel shows the retrieval scores, the exact prompt, and what it cost.</p>
      </section>`;
    return;
  }
  const s = loadSettings();
  const chunkRows = rec.results.map((r, i) => {
    const label = rec.relevance[r.chunk.chunkId];
    return `
    <div class="ev-chunk">
      <div class="ev-chunk-top">
        <span class="mono dim">#${i + 1}</span>
        <button class="ev-chunk-link" data-open="${escapeHtml(r.chunk.chunkId)}">[${escapeHtml(r.chunk.chunkId)}] ${escapeHtml(r.chunk.noteTitle)}</button>
      </div>
      <div class="ev-chunk-path dim">${escapeHtml(r.chunk.headingPath)}</div>
      <div class="ev-score">
        ${scoreBar(r.score)}
        <span class="mono">${r.score.toFixed(2)}</span>
        <span class="mono dim">${r.semantic != null ? `sem ${r.semantic.toFixed(2)} · ` : ''}lex ${r.lexical.toFixed(2)}</span>
      </div>
      <div class="ev-relevance">
        <span class="dim">relevant?</span>
        <button class="btn btn-ghost btn-xs ${label === true ? 'btn-on' : ''}" data-rel="1" data-chunk="${escapeHtml(r.chunk.chunkId)}">yes</button>
        <button class="btn btn-ghost btn-xs ${label === false ? 'btn-on' : ''}" data-rel="0" data-chunk="${escapeHtml(r.chunk.chunkId)}">no</button>
      </div>
    </div>`;
  }).join('');

  const genStatus = {
    'done': `model <span class="mono">${escapeHtml(s.model || '')}</span> · ~${rec.outputTokens ?? '—'} output tokens · ${fmtMs(rec.timings.genMs)} · est. cost $0.00 (free tier)`,
    'streaming': 'streaming…',
    'retrieval-only': 'not run — no API key set',
    'no-answer': 'not run — declined locally (low retrieval confidence)',
    'cancelled': 'stopped by you',
    'error': `failed — ${escapeHtml(rec.error?.kind || 'error')}`,
    'retrieving': '…',
  }[rec.status] || '';

  rail.innerHTML = `
    <section class="rail-section">
      <h3 class="rail-title">Evidence <span class="dim">· how this answer was made</span></h3>
      <div class="ev-q dim">“${escapeHtml(rec.question)}”</div>
    </section>
    <section class="rail-section">
      <div class="ev-step"><span class="ev-step-n mono">1</span> Embed query</div>
      <div class="ev-meta dim">${rec.mode === 'semantic'
        ? `${escapeHtml(embedder.current().short)} · ${embedder.current().dims}d · in this browser · ${fmtMs(rec.timings.embedMs)}`
        : 'skipped — lexical mode (local model unavailable or still loading)'}</div>
    </section>
    <section class="rail-section">
      <div class="ev-step"><span class="ev-step-n mono">2</span> Retrieve top ${rec.results.length} of ${state.chunks.length} chunks</div>
      <div class="ev-meta dim">${rec.mode === 'semantic' ? 'blend = 0.72 · cosine + 0.28 · keyword' : 'keyword score only'} · ${fmtMs(rec.timings.retrieveMs)}</div>
      ${chunkRows || '<div class="dim rail-empty">Nothing scored above zero.</div>'}
    </section>
    <section class="rail-section">
      <div class="ev-step"><span class="ev-step-n mono">3</span> Assemble prompt</div>
      <div class="ev-meta dim">~${rec.prompt?.inputTokens.toLocaleString() ?? '—'} input tokens</div>
      <details class="ev-prompt">
        <summary class="mono">exact prompt ${rec.status === 'retrieval-only' || rec.status === 'no-answer' ? '(would be sent)' : '(sent to OpenRouter)'}</summary>
        <pre>${escapeHtml((rec.prompt?.system || '') + '\n\n' + (rec.prompt?.user || ''))}</pre>
      </details>
    </section>
    <section class="rail-section">
      <div class="ev-step"><span class="ev-step-n mono">4</span> Generate</div>
      <div class="ev-meta dim">${genStatus}</div>
    </section>
    <div class="rail-foot dim">Steps 1–2 never leave this browser. Step 4 sends only the prompt above, with your key, directly to OpenRouter.</div>
  `;
  rail.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.open;
    openNote(id.split('.')[0], id);
  }));
  rail.querySelectorAll('[data-rel]').forEach(b => b.addEventListener('click', () => {
    const val = b.dataset.rel === '1';
    rec.relevance[b.dataset.chunk] = val;
    addFeedback({ type: 'citation', question: rec.question, chunkId: b.dataset.chunk, relevant: val, mode: rec.mode });
    toast('Relevance label saved locally — labeled retrieval data you can export.', { kind: 'success', timeout: 2200 });
    renderRail(root);
  }));
}

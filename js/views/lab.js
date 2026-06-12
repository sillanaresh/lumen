// views/lab.js — the Eval Lab.
//
// Three jobs: (1) run the benchmark against the SAME pipeline functions Ask
// uses — retrieval metrics always, generation metrics (citations, LLM-judged
// faithfulness, refusal behavior) when a key is present; (2) persist/compare
// runs; (3) the Benchmark Builder: draft cases for YOUR corpus with provenance
// gold labels, human-approved, or upload your own set.

import { state, corpusMatchesSeed, workspaceHash, resetWorkspace, embedder, loadSettings,
         idbAll, idbSet, idbDel, loadCustomBenchmark, saveCustomBenchmark, deleteCustomBenchmark,
         noteById } from '../store.js';
import { rankChunks, rankOfFirstGold, isNoAnswer, computeMetrics, computeGenMetrics,
         metricsMarkdownTable, buildPrompt, parseCitations, citationPrecision, isDecline,
         buildJudgePrompt, parseJudgeOutput, buildDraftPrompt, parseDraftOutput,
         validateBenchmark, estimateTokens } from '../pipeline.js';
import { chatOnce, AskError, ERROR_HELP } from '../openrouter.js';
import { escapeHtml, pct, fmtMs, toast, download, scoreBar, countUp, infoTip } from '../ui.js';
import { openNote } from './library.js';

let builtinBench = null;
let customBench = null;     // { version, corpus:'custom', workspaceHash, createdAt, cases }
let benchSource = 'builtin';
let running = false;
let cancelRequested = false;
let lastRun = null;
let compareSelection = new Set();
let caseFilter = 'all';
let drafts = null;          // builder drafts in progress

const TRAP_POOL = [
  'What is the capital of Iceland?',
  'How do I rotate AWS access keys safely?',
  'What did the 2030 IPCC report conclude?',
  'What dosage of ibuprofen is safe for children?',
  'How do I dispute a credit card chargeback?',
  'Who won the most recent Champions League final?',
];

export function render(root) {
  root.innerHTML = `
    <div class="lab">
      <header class="lab-head">
        <div>
          <div class="kicker">Eval Lab</div>
          <h1>Measured, <span class="grad-text">not vibes</span></h1>
          <p class="dim lab-sub">Retrieval metrics run free and locally. Add an OpenRouter key to also score <em>generation</em>:
          citation precision, LLM-judged faithfulness, and whether the model refuses what it should. The runner calls the exact
          pipeline Ask uses — same functions, same data. Everything runs and persists in this browser.</p>
        </div>
        <div class="lab-controls">
          <label class="lab-control"><span>benchmark ${infoTip('Built-in: 58 hand-written cases for the 12 seeded notes. Custom: cases for YOUR workspace, made in the builder below or uploaded as JSON.')}</span>
            <select id="lab-bench" class="input input-sm">
              <option value="builtin">built-in (seeded corpus)</option>
              <option value="custom" ${customBench ? '' : 'disabled'}>custom (your workspace)</option>
            </select>
          </label>
          <label class="lab-control"><span>mode ${infoTip('Lexical ranks chunks by keyword overlap — instant, works offline, no model needed. Semantic + lexical blends meaning-vectors (72%) with keywords (28%) — the same scoring Ask uses once the local embedding model has loaded.', { wide: true })}</span>
            <select id="lab-mode" class="input input-sm">
              <option value="lexical">lexical (no model needed)</option>
              <option value="semantic">semantic + lexical</option>
            </select>
          </label>
          <label class="lab-control"><span>top-k ${infoTip('How many chunks retrieval returns per question. Smaller = stricter, less noise in the prompt; larger = better recall, but weaker chunks ride along.')}</span>
            <select id="lab-topk" class="input input-sm">
              <option>3</option><option selected>5</option><option>8</option>
            </select>
          </label>
          <label class="lab-control lab-gen-toggle"><span>generation ${infoTip('Also generate an answer per case with your OpenRouter key, then score: citation precision (do citations point at gold notes?), faithfulness (a judge model grades the answer against the retrieved context, 1–5, strict JSON, parsed defensively with one retry), and refusal accuracy on no-answer traps. Rate limits are retried with backoff.', { wide: true })}</span>
            <span class="lab-gen-row"><input type="checkbox" id="lab-gen" /> <span class="dim" id="lab-gen-hint"></span></span>
          </label>
          <button id="lab-run" class="btn btn-primary">Run benchmark</button>
        </div>
      </header>
      <div id="lab-corpus" class="lab-corpus"></div>
      <div id="lab-progress" class="lab-progress" hidden>
        <div class="lab-progress-bar"><div id="lab-progress-fill" class="lab-progress-fill"></div></div>
        <span id="lab-progress-text" class="mono dim"></span>
        <button id="lab-cancel" class="btn btn-ghost btn-sm">Cancel</button>
      </div>
      <div id="lab-metrics" class="metric-grid"></div>
      <div class="lab-columns">
        <section class="lab-cases">
          <div class="lab-cases-head">
            <h2 class="rail-title">Per-case results</h2>
            <div class="seg">
              <button class="seg-btn ${caseFilter === 'all' ? 'seg-active' : ''}" data-filter="all">All</button>
              <button class="seg-btn ${caseFilter === 'miss' ? 'seg-active' : ''}" data-filter="miss">Misses</button>
              <button class="seg-btn ${caseFilter === 'no-answer' ? 'seg-active' : ''}" data-filter="no-answer">No-answer</button>
            </div>
          </div>
          <div id="lab-rows"></div>
        </section>
        <aside class="lab-history">
          <h2 class="rail-title">Run history <span class="dim">· stored in this browser</span></h2>
          <p class="rail-hint dim">Select two runs to compare. Export feeds the README results table.</p>
          <div id="lab-runs"></div>
          <div id="lab-compare"></div>
          <div class="btn-row">
            <button id="lab-export-json" class="btn btn-ghost btn-sm">Export JSON</button>
            <button id="lab-export-md" class="btn btn-ghost btn-sm">Export Markdown</button>
          </div>
          <div id="lab-builder"></div>
        </aside>
      </div>
      <pre id="results" hidden></pre>
    </div>
  `;

  root.querySelector('#lab-run').addEventListener('click', () => runBenchmark(root));
  root.querySelector('#lab-cancel').addEventListener('click', () => { cancelRequested = true; });
  root.querySelector('#lab-bench').addEventListener('change', (e) => { benchSource = e.target.value; renderCorpus(root); });
  root.querySelector('#lab-export-json').addEventListener('click', () => {
    if (!lastRun) return toast('Run the benchmark first.', { kind: 'warn' });
    download(`lumen-eval-${lastRun.runId}.json`, lastRun);
  });
  root.querySelector('#lab-export-md').addEventListener('click', async () => {
    const runs = await savedRuns();
    if (!runs.length) return toast('Run the benchmark first.', { kind: 'warn' });
    download('lumen-eval-results.md', metricsMarkdownTable(runs.slice(0, 10)), 'text/markdown');
  });
  root.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
    caseFilter = b.dataset.filter;
    root.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('seg-active', x === b));
    renderRows(root);
  }));

  const s = loadSettings();
  const genBox = root.querySelector('#lab-gen');
  const genHint = root.querySelector('#lab-gen-hint');
  if (!s.apiKey) { genBox.disabled = true; genHint.textContent = 'needs API key'; }
  else genHint.textContent = s.model.split('/').pop().slice(0, 22);

  Promise.all([loadBuiltin(), loadCustomBenchmark()]).then(async ([, custom]) => {
    customBench = custom || null;
    if (!customBench && benchSource === 'custom') benchSource = 'builtin';
    const sel = root.querySelector('#lab-bench');
    sel.querySelector('[value="custom"]').disabled = !customBench;
    sel.value = benchSource;
    renderCorpus(root);
    renderBuilder(root);
    if (!lastRun) lastRun = (await savedRuns())[0] || null;
    renderMetrics(root); renderRows(root); renderHistory(root);
    // Headless hook: #/lab?auto=retrieval runs lexical metrics and exposes JSON.
    if (location.hash.includes('auto=retrieval') && !running) runBenchmark(root, { auto: true });
  }).catch(err => {
    root.querySelector('#lab-corpus').innerHTML =
      `<div class="callout callout-danger">Couldn't load <span class="mono">benchmark.json</span> (${escapeHtml(String(err.message || err))}). If you opened index.html as a file, serve the folder: <span class="mono">python3 -m http.server</span>.</div>`;
  });
}

async function loadBuiltin() {
  if (builtinBench) return builtinBench;
  const resp = await fetch('./benchmark.json');
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  builtinBench = await resp.json();
  return builtinBench;
}

function activeBench() { return benchSource === 'custom' && customBench ? customBench : builtinBench; }

async function savedRuns() {
  const runs = await idbAll('evalRuns').catch(() => []);
  return runs.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
}

function renderCorpus(root) {
  const elc = root.querySelector('#lab-corpus');
  const bench = activeBench();
  if (!bench) { elc.innerHTML = ''; return; }
  const counts = bench.cases.reduce((acc, c) => { acc[c.category] = (acc[c.category] || 0) + 1; return acc; }, {});
  const isCustom = benchSource === 'custom';
  const drift = isCustom ? (customBench.workspaceHash !== workspaceHash()) : !corpusMatchesSeed();
  elc.innerHTML = `
    <div class="lab-corpus-line mono dim">
      ${isCustom ? `custom benchmark · made ${new Date(customBench.createdAt).toLocaleDateString()}` : `benchmark v${escapeHtml(bench.version)}`}
      · ${bench.cases.length} cases (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ')})
      · corpus: ${state.chunks.length} chunks from ${state.notes.length} notes
    </div>
    ${drift ? `
      <div class="callout callout-warn">
        <span>${isCustom
          ? 'Your workspace has changed since this custom benchmark was created — gold notes may have been edited or deleted, so scores may not mean what they did. Re-draft in the builder when your corpus settles.'
          : 'Your workspace differs from the 12 seeded notes these questions were written against, so scores aren\'t comparable. To benchmark <em>your</em> documents, use the Benchmark Builder on the right.'}</span>
        ${isCustom ? '' : '<button id="lab-reset-corpus" class="btn btn-ghost btn-sm">Reset corpus to seed</button>'}
        <span class="dim">or run anyway — the runner won't stop you.</span>
      </div>` : ''}
  `;
  elc.querySelector('#lab-reset-corpus')?.addEventListener('click', () => {
    resetWorkspace();
    toast('Workspace reset to the seeded benchmark corpus.', { kind: 'success' });
    renderCorpus(root);
  });
}

// ---------- Runner ----------
async function runBenchmark(root, { auto = false } = {}) {
  if (running) return;
  const bench = activeBench();
  if (!bench) return;
  const mode = auto ? 'lexical' : root.querySelector('#lab-mode').value;
  const topK = auto ? 5 : Number(root.querySelector('#lab-topk').value);
  const genWanted = !auto && root.querySelector('#lab-gen').checked;
  const settings = loadSettings();
  running = true;
  cancelRequested = false;
  const runBtn = root.querySelector('#lab-run');
  runBtn.disabled = true;
  const prog = root.querySelector('#lab-progress');
  const fill = root.querySelector('#lab-progress-fill');
  const text = root.querySelector('#lab-progress-text');
  prog.hidden = false;

  const wholeNoteChunks = state.notes.map(n => ({
    chunkId: `${n.id}.1`, noteId: n.id, noteTitle: n.title, ordinal: 1,
    headingPath: n.title, tags: n.tags || [], text: n.content, contentHash: 'wn-' + n.id,
  }));

  let getVec = null, embedQuery = null;
  if (mode === 'semantic') {
    try {
      text.textContent = 'loading local embedding model…';
      await embedder.ensureIndex((done, total) => { text.textContent = `embedding chunks ${done}/${total}…`; });
      getVec = (c) => embedder.getVec(c);
      embedQuery = (q) => embedder.embed(q);
    } catch {
      toast('Local model failed to load — falling back to lexical mode.', { kind: 'error' });
    }
  }
  const effectiveMode = getVec ? 'semantic' : 'lexical';

  const perCase = [];
  let genFailures = 0;
  let genEnabled = genWanted;
  const abort = new AbortController();
  const cases = bench.cases;
  try {
    for (let i = 0; i < cases.length; i++) {
      if (cancelRequested) break;
      const c = cases[i];
      fill.style.width = `${Math.round(((i + 1) / cases.length) * 100)}%`;
      text.textContent = `case ${i + 1}/${cases.length} · ${c.id} · retrieval`;
      const t0 = performance.now();
      const queryVec = embedQuery ? await embedQuery(c.question) : null;
      const opts = { queryVec, getVec: queryVec ? getVec : null, topK };
      const results = rankChunks(c.question, state.chunks, opts);
      const baseline = rankChunks(c.question, wholeNoteChunks, { ...opts, getVec: null, queryVec: null });
      const latencyMs = performance.now() - t0;
      const row = {
        id: c.id,
        question: c.question,
        expected: c.expected || [],
        category: c.category,
        rubric: c.rubric || '',
        rank: rankOfFirstGold(results, c.expected),
        baselineRank: rankOfFirstGold(baseline, c.expected),
        noAnswerCorrect: (c.expected || []).length === 0 ? isNoAnswer(results, effectiveMode) : null,
        latencyMs,
        retrieved: results.slice(0, topK).map(r => ({
          chunkId: r.chunk.chunkId, noteId: r.chunk.noteId, headingPath: r.chunk.headingPath,
          score: r.score, lexical: r.lexical, semantic: r.semantic,
        })),
      };

      // ----- Generation phase (optional) -----
      if (genEnabled) {
        text.textContent = `case ${i + 1}/${cases.length} · ${c.id} · generating`;
        try {
          const prompt = buildPrompt(c.question, results);
          const g0 = performance.now();
          const answer = await chatOnce({ apiKey: settings.apiKey, model: settings.model, messages: prompt.messages, signal: abort.signal });
          row.genMs = performance.now() - g0;
          row.answer = answer;
          row.outTokens = estimateTokens(answer);
          row.citations = parseCitations(answer);
          row.genDeclined = isDecline(answer);
          if (row.expected.length > 0) {
            row.citationPrecision = citationPrecision(row.citations, row.expected);
            if (!row.genDeclined) {
              text.textContent = `case ${i + 1}/${cases.length} · ${c.id} · judging`;
              const jp = buildJudgePrompt(c.question, results, answer);
              let verdict = parseJudgeOutput(await chatOnce({ apiKey: settings.apiKey, model: settings.model, messages: jp.messages, signal: abort.signal, maxTokens: 300 }).catch(() => ''));
              if (!verdict) { // one retry — judges return prose sometimes
                verdict = parseJudgeOutput(await chatOnce({ apiKey: settings.apiKey, model: settings.model, messages: jp.messages, signal: abort.signal, maxTokens: 300 }).catch(() => ''));
              }
              if (verdict) { row.faithfulness = verdict.score; row.judgeUnsupported = verdict.unsupported; }
              else row.judgeError = true;
            }
          }
          genFailures = 0;
        } catch (err) {
          if (err.name === 'AbortError') break;
          row.genError = err instanceof AskError ? err.kind : 'api';
          genFailures++;
          if (err instanceof AskError && (err.kind === 'auth' || err.kind === 'no-key')) {
            genEnabled = false;
            toast(`Generation metrics stopped: ${ERROR_HELP[err.kind]}`, { kind: 'error' });
          } else if (genFailures >= 3) {
            genEnabled = false;
            toast('Generation metrics stopped after 3 consecutive failures (likely rate limits) — retrieval metrics continue.', { kind: 'warn' });
          }
        }
      }
      perCase.push(row);
      await new Promise(r => setTimeout(r, genEnabled ? 250 : 0)); // breathe; be polite to free tiers
    }

    const metrics = computeMetrics(perCase);
    const genRows = perCase.filter(r => r.answer != null);
    if (genRows.length) metrics.gen = computeGenMetrics(genRows);
    const run = {
      runId: 'run_' + Date.now().toString(36),
      timestamp: new Date().toISOString(),
      incomplete: cancelRequested,
      config: {
        mode: effectiveMode, topK, chunking: 'chunked',
        benchmark: benchSource, cases: cases.length,
        embedder: effectiveMode === 'semantic' ? embedder.current().short : null,
        genModel: genRows.length ? settings.model : null,
        corpusMatchesSeed: corpusMatchesSeed(),
      },
      metrics,
      perCase,
    };
    lastRun = run;
    await idbSet('evalRuns', run.runId, run).catch(() => {});
    renderMetrics(root); renderRows(root); renderHistory(root);
    const pre = root.querySelector('#results');
    if (pre) pre.textContent = JSON.stringify({ config: run.config, metrics: run.metrics }, null, 2);
    if (!auto) {
      toast(cancelRequested
        ? 'Run cancelled — partial results saved with an incomplete badge.'
        : `Run complete: Hit@5 ${pct(metrics.hit5)}, MRR ${metrics.mrr.toFixed(2)}${metrics.gen ? `, faithfulness ${metrics.gen.faithfulness?.toFixed(1) ?? '—'}/5` : ''}.`,
        { kind: cancelRequested ? 'warn' : 'success' });
    }
  } finally {
    running = false;
    runBtn.disabled = false;
    prog.hidden = true;
  }
}

// ---------- Metric tiles ----------
function renderMetrics(root) {
  const grid = root.querySelector('#lab-metrics');
  if (!lastRun) {
    grid.innerHTML = `
      <div class="callout">
        No runs yet in this browser. Pick a mode and hit <strong>Run benchmark</strong> —
        lexical mode finishes in seconds and needs no API key or model download.
      </div>`;
    return;
  }
  const m = lastRun.metrics;
  const tile = (value, label, sub = '') => `
    <div class="metric">
      <div class="metric-value">${value}</div>
      <div class="metric-label">${label}</div>
      ${sub ? `<div class="metric-sub dim">${sub}</div>` : ''}
    </div>`;
  let html =
    tile(pct(m.hit1), 'Hit@1', 'gold note ranked first') +
    tile(pct(m.hit5), 'Hit@5', `whole-note baseline ${pct(m.baselineHit5)} → lift ${m.liftHit5 >= 0 ? '+' : ''}${pct(m.liftHit5)}`) +
    tile(m.mrr.toFixed(2), 'MRR', 'mean reciprocal rank') +
    tile(pct(m.noAnswerAccuracy), 'No-answer gate', `${m.noAnswer} hallucination traps`);
  if (m.gen) {
    html +=
      tile(m.gen.citationPrecision != null ? pct(m.gen.citationPrecision) : '—', 'Citation precision', 'citations pointing at gold notes') +
      tile(m.gen.faithfulness != null ? m.gen.faithfulness.toFixed(1) + '/5' : '—', 'Faithfulness', `LLM-judged${m.gen.judgeErrors ? ` · ${m.gen.judgeErrors} judge errors excluded` : ''}`) +
      tile(m.gen.genNoAnswerAccuracy != null ? pct(m.gen.genNoAnswerAccuracy) : '—', 'Gen refusal', 'model declined the traps');
  } else {
    html += tile(m.latencyP50 != null ? fmtMs(m.latencyP50) : '—', 'Retrieval p50', `p95 ${m.latencyP95 != null ? fmtMs(m.latencyP95) : '—'}`);
  }
  html += `<div class="metric metric-note">
      <div class="metric-label">run</div>
      <div class="metric-sub dim mono">${escapeHtml(lastRun.config.mode)}${lastRun.config.embedder ? '·' + escapeHtml(lastRun.config.embedder) : ''} · top-${lastRun.config.topK} · ${escapeHtml(lastRun.config.benchmark || 'builtin')}${lastRun.config.genModel ? ' · gen ' + escapeHtml(lastRun.config.genModel.split('/').pop()) : ''} · ${new Date(lastRun.timestamp).toLocaleString()}${lastRun.incomplete ? ' · <span class="warn-text">incomplete</span>' : ''}</div>
    </div>`;
  grid.innerHTML = html;
  grid.querySelectorAll('.metric-value').forEach(el => countUp(el));
}

// ---------- Per-case rows ----------
function renderRows(root) {
  const wrap = root.querySelector('#lab-rows');
  if (!lastRun) { wrap.innerHTML = ''; return; }
  let rows = lastRun.perCase;
  if (caseFilter === 'miss') rows = rows.filter(r => r.expected.length > 0 && r.rank !== 1);
  if (caseFilter === 'no-answer') rows = rows.filter(r => r.expected.length === 0);
  if (!rows.length) { wrap.innerHTML = '<div class="dim rail-empty">Nothing in this filter — that\'s a good sign.</div>'; return; }

  wrap.innerHTML = rows.map(r => {
    const isNA = r.expected.length === 0;
    const status = isNA
      ? (r.noAnswerCorrect ? ['pass', 'declined ✓'] : ['fail', 'over-retrieved'])
      : (r.rank === 1 ? ['pass', 'rank 1'] : r.rank ? ['warn', `rank ${r.rank}`] : ['fail', 'miss']);
    return `
    <details class="case case-${status[0]}">
      <summary class="case-summary">
        <span class="mono dim">${escapeHtml(r.id)}</span>
        <span class="case-q">${escapeHtml(r.question)}</span>
        <span class="mono case-status">${status[1]}${r.faithfulness != null ? ` · ${r.faithfulness}/5` : ''}</span>
        <span class="mono dim">${escapeHtml(r.category)}</span>
      </summary>
      <div class="case-detail">
        <div class="dim">gold: ${r.expected.length ? r.expected.map(escapeHtml).join(', ') : 'none — correct behavior is to decline'}${r.baselineRank ? ` · whole-note baseline rank ${r.baselineRank}` : ''}</div>
        ${r.rubric ? `<div class="dim">rubric: ${escapeHtml(r.rubric)}</div>` : ''}
        <div class="case-retrieved">
          ${r.retrieved.map(x => `
            <div class="ev-score">
              <button class="cite-chip" data-open="${escapeHtml(x.chunkId)}">[${escapeHtml(x.chunkId)}]</button>
              ${scoreBar(x.score)}
              <span class="mono">${x.score.toFixed(2)}</span>
              <span class="dim">${escapeHtml(x.headingPath)}</span>
            </div>`).join('')}
        </div>
        ${r.answer != null ? `
          <div class="case-gen">
            <div class="dim mono">generated answer${r.genDeclined ? ' · declined' : ''}${r.citationPrecision != null ? ` · cite-precision ${pct(r.citationPrecision)}` : ''}${r.judgeError ? ' · <span class="warn-text">judge unparseable ×2</span>' : ''}</div>
            <div class="case-answer">${escapeHtml(r.answer.slice(0, 600))}${r.answer.length > 600 ? '…' : ''}</div>
            ${r.judgeUnsupported?.length ? `<div class="dim">judge flagged: ${r.judgeUnsupported.map(escapeHtml).join(' · ')}</div>` : ''}
          </div>` : ''}
        ${r.genError ? `<div class="warn-text">generation failed: ${escapeHtml(r.genError)}</div>` : ''}
      </div>
    </details>`;
  }).join('');
  wrap.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', (e) => {
    e.preventDefault();
    openNote(b.dataset.open.split('.')[0], b.dataset.open);
  }));
}

// ---------- History & compare ----------
async function renderHistory(root) {
  const wrap = root.querySelector('#lab-runs');
  const runs = await savedRuns();
  if (!runs.length) { wrap.innerHTML = '<div class="dim rail-empty">No saved runs yet.</div>'; return; }
  wrap.innerHTML = runs.slice(0, 12).map(r => `
    <div class="run-row ${lastRun?.runId === r.runId ? 'run-row-active' : ''}">
      <input type="checkbox" data-cmp="${escapeHtml(r.runId)}" ${compareSelection.has(r.runId) ? 'checked' : ''} aria-label="Select for compare" />
      <button class="run-load" data-load="${escapeHtml(r.runId)}">
        <span class="mono">${escapeHtml(r.config.mode)}${r.config.embedder ? '·' + escapeHtml(r.config.embedder) : ''} · k${r.config.topK}${r.config.benchmark === 'custom' ? ' · custom' : ''}${r.metrics.gen ? ' · gen' : ''}</span>
        <span class="dim">${new Date(r.timestamp).toLocaleString()}</span>
        <span class="mono dim">Hit@5 ${pct(r.metrics.hit5)} · NA ${pct(r.metrics.noAnswerAccuracy)}${r.metrics.gen?.faithfulness != null ? ` · faith ${r.metrics.gen.faithfulness.toFixed(1)}` : ''}${r.incomplete ? ' · partial' : ''}</span>
      </button>
      <button class="icon-btn" data-del="${escapeHtml(r.runId)}" aria-label="Delete run">✕</button>
    </div>`).join('');

  wrap.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', async () => {
    lastRun = (await savedRuns()).find(r => r.runId === b.dataset.load);
    renderMetrics(root); renderRows(root); renderHistory(root);
  }));
  wrap.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    await idbDel('evalRuns', b.dataset.del);
    compareSelection.delete(b.dataset.del);
    if (lastRun?.runId === b.dataset.del) lastRun = null;
    renderMetrics(root); renderRows(root); renderHistory(root);
  }));
  wrap.querySelectorAll('[data-cmp]').forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked) compareSelection.add(cb.dataset.cmp); else compareSelection.delete(cb.dataset.cmp);
    if (compareSelection.size > 2) compareSelection.delete(compareSelection.values().next().value);
    renderHistory(root);
  }));
  renderCompare(root, runs);
}

function renderCompare(root, runs) {
  const wrap = root.querySelector('#lab-compare');
  if (compareSelection.size !== 2) { wrap.innerHTML = ''; return; }
  const [a, b] = Array.from(compareSelection).map(id => runs.find(r => r.runId === id)).filter(Boolean);
  if (!a || !b) { wrap.innerHTML = ''; return; }
  const rows = [
    ['Hit@1', a.metrics.hit1, b.metrics.hit1, pct],
    ['Hit@5', a.metrics.hit5, b.metrics.hit5, pct],
    ['MRR', a.metrics.mrr, b.metrics.mrr, (n) => n.toFixed(2)],
    ['No-answer', a.metrics.noAnswerAccuracy, b.metrics.noAnswerAccuracy, pct],
  ];
  if (a.metrics.gen && b.metrics.gen) {
    rows.push(['Cite-prec', a.metrics.gen.citationPrecision, b.metrics.gen.citationPrecision, pct]);
    rows.push(['Faithfulness', a.metrics.gen.faithfulness, b.metrics.gen.faithfulness, (n) => n?.toFixed(1) ?? '—']);
  }
  wrap.innerHTML = `
    <div class="compare">
      <div class="compare-head mono dim">
        <span>metric</span><span>${escapeHtml(a.config.mode)}·k${a.config.topK}</span><span>${escapeHtml(b.config.mode)}·k${b.config.topK}</span><span>Δ</span>
      </div>
      ${rows.map(([label, va, vb, fmt]) => {
        if (va == null || vb == null) return `<div class="compare-row"><span>${label}</span><span class="mono">${va != null ? fmt(va) : '—'}</span><span class="mono">${vb != null ? fmt(vb) : '—'}</span><span class="dim">—</span></div>`;
        const d = vb - va;
        return `<div class="compare-row">
          <span>${label}</span><span class="mono">${fmt(va)}</span><span class="mono">${fmt(vb)}</span>
          <span class="mono ${d > 0.0001 ? 'delta-up' : d < -0.0001 ? 'delta-down' : 'dim'}">${d >= 0 ? '+' : ''}${fmt === pct ? pct(d) : d.toFixed(2)}</span>
        </div>`;
      }).join('')}
    </div>`;
}

// ---------- Benchmark Builder ----------
function renderBuilder(root) {
  const wrap = root.querySelector('#lab-builder');
  const s = loadSettings();
  wrap.innerHTML = `
    <h2 class="rail-title" style="margin-top:24px">Benchmark builder <span class="dim">· for your corpus</span></h2>
    <p class="rail-hint dim">AI drafts a question <em>from</em> each chunk, so the gold label is provenance — the drafting model
    never judges correctness. You approve every case. Synthetic phrasing tends to flatter retrieval, so custom runs are labeled
    and never compared against the built-in set.</p>
    ${customBench ? `
      <div class="callout" style="margin-bottom:10px">
        <span>Custom benchmark: <strong>${customBench.cases.length} cases</strong> · ${new Date(customBench.createdAt).toLocaleDateString()}</span>
        <span class="btn-row" style="margin-top:6px">
          <button id="bb-export" class="btn btn-ghost btn-xs">Export JSON</button>
          <button id="bb-delete" class="btn btn-danger btn-xs">Delete</button>
        </span>
      </div>` : ''}
    <div class="btn-row">
      <button id="bb-draft" class="btn btn-ghost btn-sm" ${s.apiKey ? '' : 'disabled title="Needs an OpenRouter key (Settings)"'}>Draft with AI</button>
      <label class="btn btn-ghost btn-sm" style="cursor:pointer">Upload JSON<input id="bb-upload" type="file" accept="application/json,.json" hidden /></label>
      <button id="bb-template" class="btn btn-ghost btn-sm">Template</button>
    </div>
    <div id="bb-drafts"></div>
  `;
  wrap.querySelector('#bb-export')?.addEventListener('click', () => download('lumen-custom-benchmark.json', customBench));
  wrap.querySelector('#bb-delete')?.addEventListener('click', async () => {
    await deleteCustomBenchmark();
    customBench = null;
    if (benchSource === 'custom') benchSource = 'builtin';
    root.querySelector('#lab-bench').value = 'builtin';
    root.querySelector('#lab-bench [value="custom"]').disabled = true;
    renderCorpus(root); renderBuilder(root);
    toast('Custom benchmark deleted.', { kind: 'info' });
  });
  wrap.querySelector('#bb-template').addEventListener('click', () => {
    download('lumen-benchmark-template.json', {
      version: 'custom-1', corpus: 'your-workspace',
      cases: [
        { id: 'q001', question: 'A question one of your notes answers', expected: [state.notes[0]?.id || 'noteId'], category: 'single-hop', rubric: 'What good retrieval looks like' },
        { id: 'q002', question: 'A question your notes do NOT answer', expected: [], category: 'no-answer', rubric: 'Correct behavior is to decline' },
      ],
    });
  });
  wrap.querySelector('#bb-upload').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const known = new Set(state.notes.map(n => n.id));
      const v = validateBenchmark(json, known);
      if (!v.ok) { toast(`Invalid benchmark: ${v.errors[0]}${v.errors.length > 1 ? ` (+${v.errors.length - 1} more)` : ''}`, { kind: 'error', timeout: 6000 }); return; }
      await persistCustom(root, v.cases, 'uploaded');
    } catch { toast('That file is not valid JSON.', { kind: 'error' }); }
  });
  wrap.querySelector('#bb-draft')?.addEventListener('click', () => draftWithAI(root));
  renderDrafts(root);
}

async function draftWithAI(root) {
  const s = loadSettings();
  if (!s.apiKey) return;
  const btn = root.querySelector('#bb-draft');
  btn.disabled = true;
  const eligible = state.chunks.filter(c => c.text.length > 200);
  if (eligible.length < 3) {
    toast('Need at least 3 substantial chunks to draft from — import or write more notes first.', { kind: 'warn' });
    btn.disabled = false;
    return;
  }
  // Sample evenly across notes so one long document doesn't dominate.
  const byNote = new Map();
  for (const c of eligible) {
    if (!byNote.has(c.noteId)) byNote.set(c.noteId, []);
    byNote.get(c.noteId).push(c);
  }
  const target = Math.min(12, eligible.length);
  const picked = [];
  const noteLists = Array.from(byNote.values());
  let li = 0;
  while (picked.length < target && noteLists.some(l => l.length)) {
    const list = noteLists[li % noteLists.length];
    if (list.length) picked.push(list.splice(Math.floor(Math.random() * list.length), 1)[0]);
    li++;
  }
  drafts = [];
  renderDrafts(root, `drafting 0/${picked.length}…`);
  try {
    for (let i = 0; i < picked.length; i++) {
      const chunk = picked[i];
      renderDrafts(root, `drafting ${i + 1}/${picked.length}…`);
      try {
        const q = parseDraftOutput(await chatOnce({
          apiKey: s.apiKey, model: s.model, messages: buildDraftPrompt(chunk).messages, maxTokens: 150,
        }));
        if (q) drafts.push({ question: q, expected: [chunk.noteId], chunkId: chunk.chunkId, keep: true });
      } catch (err) {
        if (err instanceof AskError && err.kind === 'auth') { toast(ERROR_HELP.auth, { kind: 'error' }); break; }
      }
      await new Promise(r => setTimeout(r, 300));
    }
    // Refusal traps: generic out-of-corpus questions, editable like the rest.
    for (const q of TRAP_POOL.slice(0, 4)) drafts.push({ question: q, expected: [], chunkId: null, keep: true });
    renderDrafts(root);
    toast(`Drafted ${drafts.filter(d => d.expected.length).length} questions + 4 refusal traps — review each one below.`, { kind: 'success' });
  } finally {
    btn.disabled = false;
  }
}

function renderDrafts(root, progress = null) {
  const wrap = root.querySelector('#bb-drafts');
  if (!wrap) return;
  if (progress) { wrap.innerHTML = `<div class="dim rail-empty"><span class="spinner"></span>${escapeHtml(progress)}</div>`; return; }
  if (!drafts) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `
    <div class="bb-list">
      ${drafts.map((d, i) => `
        <div class="bb-row ${d.keep ? '' : 'bb-row-off'}">
          <input class="input input-sm bb-q" data-i="${i}" value="${escapeHtml(d.question)}" ${d.keep ? '' : 'disabled'} />
          <span class="mono dim bb-gold">${d.expected.length ? `→ ${escapeHtml(noteById(d.expected[0])?.title || d.expected[0])}` : '→ should decline'}</span>
          <button class="icon-btn bb-toggle" data-i="${i}" title="${d.keep ? 'Exclude' : 'Include'}">${d.keep ? '✕' : '↺'}</button>
        </div>`).join('')}
    </div>
    <div class="btn-row" style="margin-top:8px">
      <button id="bb-save" class="btn btn-primary btn-sm">Save as custom benchmark (${drafts.filter(d => d.keep).length})</button>
      <button id="bb-discard" class="btn btn-ghost btn-sm">Discard drafts</button>
    </div>`;
  wrap.querySelectorAll('.bb-q').forEach(inp => inp.addEventListener('input', () => { drafts[Number(inp.dataset.i)].question = inp.value; }));
  wrap.querySelectorAll('.bb-toggle').forEach(b => b.addEventListener('click', () => {
    const d = drafts[Number(b.dataset.i)];
    d.keep = !d.keep;
    renderDrafts(root);
  }));
  wrap.querySelector('#bb-discard')?.addEventListener('click', () => { drafts = null; renderDrafts(root); });
  wrap.querySelector('#bb-save')?.addEventListener('click', async () => {
    const kept = drafts.filter(d => d.keep && d.question.trim().length >= 8);
    if (kept.length < 3) { toast('Keep at least 3 cases.', { kind: 'warn' }); return; }
    const cases = kept.map((d, i) => ({
      id: 'c' + String(i + 1).padStart(3, '0'),
      question: d.question.trim(),
      expected: d.expected,
      category: d.expected.length === 0 ? 'no-answer' : 'single-hop',
      difficulty: 'easy',
      rubric: d.chunkId ? `Drafted from chunk [${d.chunkId}]; human-approved.` : 'Out-of-corpus trap; correct behavior is to decline.',
    }));
    drafts = null;
    await persistCustom(root, cases, 'drafted');
  });
}

async function persistCustom(root, cases, origin) {
  customBench = {
    version: 'custom-1',
    corpus: 'custom-workspace',
    origin,
    workspaceHash: workspaceHash(),
    createdAt: new Date().toISOString(),
    cases,
  };
  await saveCustomBenchmark(customBench);
  benchSource = 'custom';
  const sel = root.querySelector('#lab-bench');
  sel.querySelector('[value="custom"]').disabled = false;
  sel.value = 'custom';
  renderCorpus(root); renderBuilder(root);
  toast(`Custom benchmark saved (${cases.length} cases) and selected — run it.`, { kind: 'success' });
}

// pipeline.js — the pure retrieval/answer pipeline.
//
// Everything in this file is a pure function: no DOM, no storage, no network.
// The Ask view and the Eval Lab call the SAME functions — that guarantee is the
// point of the eval: it measures the real pipeline, not a copy of it.

export const CHUNK_SIZE_CHARS = 1200;   // ~300 tokens
export const CHUNK_OVERLAP = 0.15;
export const DEFAULT_TOP_K = 5;
export const BLEND = { semantic: 0.72, lexical: 0.28 };
// Below these blended scores Lumen says "your notes don't cover this"
// instead of sending weak context to a model. Tuned on the benchmark's
// no-answer cases (see docs/eval-report.md).
export const NO_ANSWER_THRESHOLD = { semantic: 0.3, lexical: 0.2 };

const STOPWORDS = new Set(('a an and are as at be but by for from has have how i in is it its of on or that the this to was what when where which who why will with you your'.split(' ')));

export function contentHash(s) {
  // FNV-1a, 32-bit — stable cache key for chunk text, not cryptographic.
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function stripMarkdown(s) {
  return String(s ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_]+/g, ' ')
    .replace(/^\s*-\s+/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTokens(s) {
  return (String(s).toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

// Keyword score over a chunk. Title/heading/tag matches outweigh body matches;
// a long phrase match is a strong signal. Normalized roughly to 0..1+.
export function lexicalScore(query, chunk) {
  const qTokens = Array.from(new Set(normalizeTokens(query)));
  if (qTokens.length === 0) return 0;
  const body = stripMarkdown(chunk.text).toLowerCase();
  const title = `${chunk.noteTitle} ${chunk.headingPath}`.toLowerCase();
  const tagText = (chunk.tags || []).join(' ').toLowerCase();
  const bodyTokens = new Set(normalizeTokens(body));
  let score = 0;
  for (const t of qTokens) {
    if (title.includes(t)) score += 2.6;
    if (tagText.includes(t)) score += 1.8;
    if (bodyTokens.has(t)) score += 1;
    else if (body.includes(t)) score += 0.25;
  }
  const phrase = String(query).toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (phrase.length > 10 && body.includes(phrase)) score += 3;
  return score / Math.max(3, qTokens.length);
}

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // embeddings are L2-normalized upstream
}

// ---------- Chunking ----------

function splitSentences(text) {
  const clean = String(text).trim();
  if (!clean) return [];
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try {
      return Array.from(new Intl.Segmenter('en', { granularity: 'sentence' }).segment(clean))
        .map(s => s.segment.trim()).filter(Boolean);
    } catch { /* fall through */ }
  }
  return clean.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
}

function hardSplit(text, maxChars) {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];
  const out = [];
  let cur = '';
  for (const s of sentences) {
    if (s.length > maxChars) {
      if (cur.trim()) out.push(cur.trim());
      // character-window fallback for one giant "sentence" (URLs, non-English)
      for (let i = 0; i < s.length; i += maxChars) out.push(s.slice(i, i + maxChars).trim());
      cur = '';
    } else if ((cur + ' ' + s).trim().length > maxChars && cur.trim()) {
      out.push(cur.trim());
      cur = s;
    } else {
      cur = cur ? cur + ' ' + s : s;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Split markdown into blocks that carry their heading path. Code fences are
// never split mid-fence; an oversized fence becomes its own block.
export function markdownBlocks(content, fallbackHeading) {
  const blocks = [];
  const headingStack = [fallbackHeading];
  const lines = String(content || '').split('\n');
  let buffer = [];
  let inFence = false;
  let fence = [];
  const path = () => headingStack.filter(Boolean).join(' › ') || fallbackHeading;
  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) blocks.push({ text, headingPath: path() });
    buffer = [];
  };
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      if (!inFence) { flush(); inFence = true; fence = [line]; }
      else {
        fence.push(line);
        blocks.push({ text: fence.join('\n').trim(), headingPath: path(), code: true });
        fence = []; inFence = false;
      }
      continue;
    }
    if (inFence) { fence.push(line); continue; }
    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      flush();
      headingStack.length = Math.max(1, h[1].length);
      headingStack[h[1].length - 1] = h[2].trim();
      continue;
    }
    if (!line.trim()) flush(); else buffer.push(line);
  }
  if (inFence && fence.length) blocks.push({ text: fence.join('\n').trim(), headingPath: path(), code: true });
  flush();
  if (blocks.length === 0) blocks.push({ text: fallbackHeading, headingPath: fallbackHeading });
  return blocks;
}

// Chunk one note: merge blocks up to the target size, hard-split oversized
// paragraphs at sentence boundaries, 15% overlap between adjacent chunks.
// Notes shorter than one chunk produce exactly one chunk (chunk == note).
export function chunkNote(note, opts = {}) {
  const target = opts.size ?? CHUNK_SIZE_CHARS;
  const overlapChars = Math.round(target * (opts.overlap ?? CHUNK_OVERLAP));
  const blocks = markdownBlocks(note.content, note.title);
  const raw = [];
  let cur = { text: '', headingPath: blocks[0]?.headingPath || note.title };
  const push = () => {
    if (!cur.text.trim()) return;
    raw.push({ text: cur.text.trim(), headingPath: cur.headingPath || note.title });
    cur = { text: '', headingPath: note.title };
  };
  for (const block of blocks) {
    const parts = (!block.code && block.text.length > target) ? hardSplit(block.text, target) : [block.text];
    for (const part of parts) {
      if (!part.trim()) continue;
      if (!cur.text.trim()) cur = { text: part.trim(), headingPath: block.headingPath };
      else if ((cur.text + '\n\n' + part).length <= target) cur.text += '\n\n' + part.trim();
      else {
        push();
        const tail = overlapChars > 0 && raw.length
          ? raw[raw.length - 1].text.slice(-overlapChars).replace(/^\S+\s?/, '').trim() : '';
        cur = { text: (tail ? tail + '\n\n' : '') + part.trim(), headingPath: block.headingPath };
      }
    }
  }
  push();
  return raw.map((c, i) => {
    const chunkId = `${note.id}.${i + 1}`;
    return {
      chunkId,
      noteId: note.id,
      noteTitle: note.title,
      ordinal: i + 1,
      headingPath: c.headingPath,
      tags: note.tags || [],
      text: c.text,
      contentHash: contentHash(`${c.headingPath}\n${c.text}`),
    };
  });
}

export function chunkAll(notes) {
  return notes.flatMap(n => chunkNote(n));
}

// ---------- Retrieval ----------

// Rank chunks for a query. queryVec/getVec are optional — without them this is
// pure lexical retrieval (the no-API-key and model-failed path).
export function rankChunks(query, chunks, { queryVec = null, getVec = null, topK = DEFAULT_TOP_K, blend = BLEND } = {}) {
  const semanticOn = !!(queryVec && getVec);
  return chunks
    .map(chunk => {
      const lexical = lexicalScore(query, chunk);
      const semantic = semanticOn ? cosine(queryVec, getVec(chunk)) : 0;
      const blended = semanticOn
        ? semantic * blend.semantic + Math.min(lexical, 1) * blend.lexical
        : lexical;
      return { chunk, lexical, semantic: semanticOn ? semantic : null, score: blended };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// Honest refusal gate: if even the best chunk is weak, the right product
// behavior is to say so rather than let a model improvise.
export function isNoAnswer(results, mode = 'lexical') {
  const top = results[0]?.score ?? 0;
  return top < (mode === 'semantic' ? NO_ANSWER_THRESHOLD.semantic : NO_ANSWER_THRESHOLD.lexical);
}

// ---------- Prompt ----------

export function estimateTokens(s) { return Math.ceil(String(s || '').length / 4); }

export function buildPrompt(question, results) {
  const context = results.map(({ chunk }) =>
    `[${chunk.chunkId}] ${chunk.noteTitle} › ${chunk.headingPath}\n${stripMarkdown(chunk.text).slice(0, 1100)}`
  ).join('\n\n---\n\n');

  const system = `You are Lumen, an assistant that answers questions using ONLY the user's retrieved note chunks.
Rules:
- Ground every claim in the supplied chunks. If they don't contain the answer, say exactly: "Your notes don't seem to cover this." and stop.
- Cite chunk IDs inline, e.g. [n01.1]. Every substantive claim carries a citation.
- Be concise — under 180 words. Light markdown only.
- Never invent notes, chunks, or facts.`;

  const user = `Retrieved chunks:\n\n${context || '(no relevant chunks found)'}\n\n---\n\nQuestion: ${question}`;
  return {
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    system,
    user,
    inputTokens: estimateTokens(system + user),
  };
}

// Extract [n01.2]-style citations from generated text.
export function parseCitations(text) {
  const out = [];
  const seen = new Set();
  for (const m of String(text).matchAll(/\[([a-z][a-z0-9_]*\.\d+)\]/gi)) {
    const id = m[1].toLowerCase();
    if (!seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}

// Of the citations in an answer, how many point at gold notes?
export function citationPrecision(citedChunkIds, goldNoteIds) {
  if (!citedChunkIds.length) return null;
  const gold = new Set(goldNoteIds);
  const ok = citedChunkIds.filter(id => gold.has(id.split('.')[0])).length;
  return ok / citedChunkIds.length;
}

// ---------- Eval metrics ----------

export function rankOfFirstGold(results, goldNoteIds) {
  if (!goldNoteIds?.length) return null;
  const gold = new Set(goldNoteIds);
  const i = results.findIndex(r => gold.has(r.chunk.noteId));
  return i >= 0 ? i + 1 : null;
}

// perCase rows: { expected:[], rank, baselineRank, noAnswerCorrect, latencyMs }
export function computeMetrics(perCase) {
  const answerable = perCase.filter(r => r.expected.length > 0);
  const noAnswer = perCase.filter(r => r.expected.length === 0);
  const frac = (arr, fn) => arr.filter(fn).length / Math.max(1, arr.length);
  const hit1 = frac(answerable, r => r.rank === 1);
  const hit5 = frac(answerable, r => r.rank && r.rank <= 5);
  const mrr = answerable.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / Math.max(1, answerable.length);
  const baselineHit5 = frac(answerable, r => r.baselineRank && r.baselineRank <= 5);
  const noAnswerAccuracy = frac(noAnswer, r => r.noAnswerCorrect);
  const lat = perCase.map(r => r.latencyMs).filter(Number.isFinite).sort((a, b) => a - b);
  const q = (p) => lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] : null;
  return {
    cases: perCase.length,
    answerable: answerable.length,
    noAnswer: noAnswer.length,
    hit1, hit5, mrr,
    baselineHit5,
    liftHit5: hit5 - baselineHit5,
    noAnswerAccuracy,
    latencyP50: q(0.5),
    latencyP95: q(0.95),
  };
}

export function metricsMarkdownTable(runs) {
  const p = (n) => Number.isFinite(n) ? `${Math.round(n * 100)}%` : '—';
  const head = '| Run | Mode | Top-k | Cases | Hit@1 | Hit@5 | MRR | Whole-note Hit@5 | Lift | No-answer | p50 |';
  const sep = '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|';
  const rows = runs.map(r => {
    const m = r.metrics;
    return `| ${new Date(r.timestamp).toISOString().slice(0, 10)} | ${r.config.mode} | ${r.config.topK} | ${m.cases} | ${p(m.hit1)} | ${p(m.hit5)} | ${m.mrr.toFixed(2)} | ${p(m.baselineHit5)} | ${m.liftHit5 >= 0 ? '+' : ''}${p(m.liftHit5)} | ${p(m.noAnswerAccuracy)} | ${m.latencyP50 != null ? Math.round(m.latencyP50) + 'ms' : '—'} |`;
  });
  return [head, sep, ...rows].join('\n');
}

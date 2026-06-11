// openrouter.js — streaming chat client. The ONLY place where note content can
// leave the browser, and only with the user's own key.

export class AskError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'no-key' | 'auth' | 'rate-limit' | 'network' | 'empty' | 'api'
  }
}

export const ERROR_HELP = {
  'no-key': 'Add a free OpenRouter key in Settings to generate answers. Retrieval already ran locally.',
  'auth': 'OpenRouter rejected the API key (401). Re-check it in Settings — keys start with "sk-or-".',
  'rate-limit': 'Rate limited by OpenRouter (429). Free models throttle aggressively — wait a moment and retry, or pick another model in Settings.',
  'network': 'Could not reach OpenRouter. Check your connection and retry.',
  'empty': 'The model returned an empty response. Retry, or switch models in Settings.',
  'api': 'OpenRouter returned an error. Retry, or switch models in Settings.',
};

export async function streamChat({ apiKey, model, messages, onToken, signal }) {
  if (!apiKey) throw new AskError('no-key', 'No API key configured');
  let resp;
  try {
    resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': location.origin,
        'X-Title': 'Lumen',
      },
      body: JSON.stringify({ model, messages, stream: true, temperature: 0.3 }),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new AskError('network', String(err.message || err));
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    if (resp.status === 401 || resp.status === 403) throw new AskError('auth', text.slice(0, 200));
    if (resp.status === 429) throw new AskError('rate-limit', text.slice(0, 200));
    throw new AskError('api', `${resp.status}: ${text.slice(0, 200)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let total = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') { buffer = ''; break; }
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content || '';
        if (delta) { total += delta; onToken?.(delta, total); }
      } catch { /* partial frame */ }
    }
  }
  if (!total.trim()) throw new AskError('empty', 'Model returned no content');
  return total;
}

// Cheap "test key" ping — fetches the models list with the key.
export async function testKey(apiKey) {
  const resp = await fetch('https://openrouter.ai/api/v1/key', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (resp.status === 401 || resp.status === 403) return { ok: false, reason: 'Invalid key (401).' };
  if (!resp.ok) return { ok: false, reason: `OpenRouter responded ${resp.status}.` };
  return { ok: true };
}

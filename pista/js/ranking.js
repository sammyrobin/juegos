// Global ranking client for api/scores.php. The game never depends on it: every call
// has a timeout and any failure (offline, server down, no PHP) resolves to null, so the
// race, the local record and the menus keep working without the ranking.

const API = new URL('../api/scores.php', import.meta.url).href;
const TIMEOUT = 6000;
export const TOP = 20;

/** Nickname rule, the same one the server checks: 3–12 letters, digits or "_". */
export const validName = (name) => /^[A-Za-z0-9_]{3,12}$/.test(name);

async function call(method, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(API, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      credentials: 'omit',
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    return data && typeof data === 'object' ? { status: res.status, ...data } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const Ranking = {
  token: null,     // this race's token (the server times the race with it)
  top: null,       // last list received

  /** A race begins: ask for a token. Without one, this race simply is not ranked. */
  async startRun() {
    this.token = null;
    const r = await call('POST', { action: 'start' });
    if (r?.ok && typeof r.token === 'string') this.token = r.token;
  },

  /** Top 20, or null when the server does not answer. */
  async fetchTop() {
    const r = await call('GET');
    if (!r?.ok || !Array.isArray(r.scores)) return null;
    this.top = r.scores;
    return r.scores;
  },

  qualifies(score, list) {
    return score > 0 && (list.length < TOP || score > list[TOP - 1].score);
  },

  /**
   * Send the race's score. Returns the server's answer ({ ok, rank, scores } or
   * { ok: false, error }) or null when it does not answer. A refused nickname keeps the
   * token, so the player can try another one.
   */
  async submit({ name, score, distance, car }) {
    if (!this.token) return { ok: false, error: 'token' };
    const r = await call('POST', { action: 'submit', token: this.token, name, score, distance, car });
    if (r && (r.ok || r.error === 'token' || r.error === 'not_top' || r.error === 'implausible')) this.token = null;
    if (r && Array.isArray(r.scores)) this.top = r.scores;
    return r;
  },
};

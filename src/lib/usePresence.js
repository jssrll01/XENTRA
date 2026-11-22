import { useEffect, useState } from 'react';
import { getPresence } from './api';

const cache = {};
const listeners = new Set();
let queue = new Set();
let timer = null;

async function flush() {
  const ids = Array.from(queue);
  queue = new Set();
  timer = null;
  const r = await getPresence(ids);
  const now = Date.now();
  if (r.ok) ids.forEach((i) => { cache[i] = { v: (r.data || {})[i] || null, t: now }; });
  listeners.forEach((f) => f());
}

function request(id) {
  queue.add(id);
  if (!timer) timer = setTimeout(flush, 60);
}

// Returns { state, last_seen, status_text } or null. A failed lookup shows no dot; presence is decoration only.
export default function usePresence(id) {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!id) return undefined;
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    const c = cache[id];
    if (!c || Date.now() - c.t > 60000) request(id);
    const t = setInterval(() => request(id), 60000);
    return () => { listeners.delete(l); clearInterval(t); };
  }, [id]);
  const c = id ? cache[id] : null;
  return c && c.v ? c.v : null;
}

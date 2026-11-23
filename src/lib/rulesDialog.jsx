import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck } from 'lucide-react';

let cur = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f(cur));

export const askRules = (text) => new Promise((res) => {
  if (cur) cur.done(false);
  cur = { text: String(text || ''), done: (v) => { cur = null; emit(); res(v); } };
  emit();
});

function parse(text) {
  const chunks = text.replace(/\r/g, '').trim().split(/\n\s*(?=\d+\.\s)/);
  let intro = '';
  const items = [];
  const notes = [];
  chunks.forEach((c, i) => {
    const m = c.match(/^(\d+)\.\s+([\s\S]*)$/);
    if (!m) { if (i === 0) intro = c.trim(); else notes.push(c.trim()); return; }
    const parts = m[2].split(/\n\s*\n/);
    const t = parts[0].match(/^([^.]{2,60})\.\s+([\s\S]*)$/);
    items.push({ n: m[1], title: t ? t[1] : '', body: t ? t[2] : parts[0] });
    parts.slice(1).forEach((p) => { if (p.trim()) notes.push(p.trim()); });
  });
  return { intro, items, notes };
}

export default function RulesHost() {
  const [d, setD] = useState(null);
  const [ok, setOk] = useState(false);
  useEffect(() => { subs.add(setD); return () => { subs.delete(setD); }; }, []);
  useEffect(() => { setOk(false); }, [d]);
  useEffect(() => {
    if (!d) return undefined;
    const k = (e) => { if (e.key === 'Escape') d.done(false); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [d]);
  if (!d) return null;
  const p = parse(d.text);
  return createPortal(
    <div className="rl-back" onClick={() => d.done(false)}>
      <div className="rl" role="dialog" aria-modal="true" aria-label="Community rules" onClick={(e) => e.stopPropagation()}>
        <div className="rl-head">
          <span className="rl-ic"><ShieldCheck size={22} /></span>
          <div><b>Community rules</b><span>Please read before joining</span></div>
        </div>
        <div className="rl-body">
          {p.intro ? <p className="rl-intro">{p.intro}</p> : null}
          {p.items.length === 0 && !p.intro ? <p className="rl-intro">{d.text}</p> : null}
          <ol className="rl-list">
            {p.items.map((it) => (
              <li key={it.n} className="rl-item">
                <span className="rl-n">{it.n}</span>
                <div>{it.title ? <b>{it.title}</b> : null}<p>{it.body}</p></div>
              </li>
            ))}
          </ol>
          {p.notes.map((n, i) => <p key={i} className="rl-note">{n}</p>)}
        </div>
        <div className="rl-foot">
          <label className="rl-agree"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> I have read and agree to these rules</label>
          <div className="rl-acts">
            <button type="button" className="btn btn-secondary" onClick={() => d.done(false)}>Decline</button>
            <button type="button" className="btn btn-primary" disabled={!ok} onClick={() => d.done(true)}>Accept and join</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

let cur = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f(cur));
const open = (d) => new Promise((res) => {
  if (cur) cur.done(cur.prompt ? null : false);
  cur = { ...d, done: (v) => { cur = null; emit(); res(v); } };
  emit();
});
export const ask = (message, okLabel) => open({ message, ok: okLabel || 'Confirm' });
export const promptText = (message, value) => open({ message, prompt: true, value: value || '', ok: 'OK' });

export default function DialogHost() {
  const [d, setD] = useState(null);
  const [v, setV] = useState('');
  useEffect(() => { subs.add(setD); return () => { subs.delete(setD); }; }, []);
  useEffect(() => { setV(d && d.prompt ? d.value : ''); }, [d]);
  useEffect(() => {
    if (!d) return undefined;
    const k = (e) => { if (e.key === 'Escape') d.done(d.prompt ? null : false); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [d]);
  if (!d) return null;
  const no = () => d.done(d.prompt ? null : false);
  const yes = () => d.done(d.prompt ? v : true);
  return createPortal(
    <div className="dlg-back" onClick={no}>
      <div className="dlg" role="alertdialog" aria-modal="true" aria-label={d.message} onClick={(e) => e.stopPropagation()}>
        <p>{d.message}</p>
        {d.prompt ? <input type="text" autoFocus value={v} aria-label="Value" onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') yes(); }} /> : null}
        <div className="dlg-acts">
          <button type="button" className="btn btn-secondary btn-sm" onClick={no}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={yes}>{d.ok}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

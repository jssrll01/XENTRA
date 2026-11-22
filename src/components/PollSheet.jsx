import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import Sheet from './Sheet';
import { createPoll } from '../lib/api';

export default function PollSheet({ conversationId, onClose, onDone }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const [multi, setMulti] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const clean = opts.map((o) => o.trim()).filter(Boolean);
  const ok = q.trim().length > 0 && clean.length >= 2 && !busy;
  const setOpt = (i, v) => setOpts((p) => p.map((x, j) => (j === i ? v : x)));
  const save = async () => {
    setBusy(true); setErr('');
    const r = await createPoll(conversationId, q.trim(), clean, multi, crypto.randomUUID());
    setBusy(false);
    if (r.ok) onDone(); else setErr(r.error);
  };
  return (
    <Sheet title="New poll" onClose={onClose}>
      {err ? <div className="alert err">{err}</div> : null}
      <input type="text" placeholder="Question" aria-label="Question" maxLength={200} value={q} onChange={(e) => setQ(e.target.value)} />
      {opts.map((o, i) => (
        <div className="po-row" key={i}>
          <input type="text" placeholder={'Option ' + (i + 1)} aria-label={'Option ' + (i + 1)} maxLength={100} value={o} onChange={(e) => setOpt(i, e.target.value)} />
          {opts.length > 2 ? <button type="button" className="icon-btn" aria-label={'Remove option ' + (i + 1)} onClick={() => setOpts((p) => p.filter((_, j) => j !== i))}><X size={18} /></button> : null}
        </div>
      ))}
      {opts.length < 10 ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpts((p) => [...p, ''])}><Plus size={16} /> Add option</button> : null}
      <label className="po-chk"><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> Allow multiple answers</label>
      <button type="button" className="btn btn-primary btn-block" disabled={!ok} onClick={save}>{busy ? 'Sending...' : 'Send poll'}</button>
    </Sheet>
  );
}

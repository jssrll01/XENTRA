import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import Sheet from './Sheet';
import { createPoll } from '../lib/api';

const CLOSE_OPTIONS = [
  { v: '', t: 'No closing time' },
  { v: '3600', t: 'Closes in 1 hour' },
  { v: '86400', t: 'Closes in 24 hours' },
  { v: '259200', t: 'Closes in 3 days' },
  { v: '604800', t: 'Closes in 7 days' },
];

export default function PollSheet({ conversationId, context = 'chat', onClose, onDone }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const [multi, setMulti] = useState(false);
  const [anon, setAnon] = useState(false);
  const [after, setAfter] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const clean = opts.map((o) => o.trim()).filter(Boolean);
  const ok = q.trim().length > 0 && clean.length >= 2 && !busy;
  const setOpt = (i, v) => setOpts((p) => p.map((x, j) => (j === i ? v : x)));
  const save = async () => {
    setBusy(true); setErr('');
    const closesAt = after ? new Date(Date.now() + Number(after) * 1000).toISOString() : null;
    const r = await createPoll(conversationId, q.trim(), clean, multi, crypto.randomUUID(), anon, closesAt, context);
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
      <label className="po-chk"><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> Anonymous voting (nobody sees who voted)</label>
      <select className="po-sel" aria-label="Closing time" value={after} onChange={(e) => setAfter(e.target.value)}>
        {CLOSE_OPTIONS.map((c) => <option key={c.v} value={c.v}>{c.t}</option>)}
      </select>
      <button type="button" className="btn btn-primary btn-block" disabled={!ok} onClick={save}>{busy ? 'Sending...' : 'Send poll'}</button>
    </Sheet>
  );
}

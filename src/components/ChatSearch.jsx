import React, { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { searchMessages } from '../lib/api';
import { clock, dayLabel } from '../lib/chatTime';

export default function ChatSearch({ conversationId, onClose, onJump }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (q.trim().length < 2) { setRows(null); setErr(''); return undefined; }
    let live = true;
    const t = setTimeout(async () => {
      const r = await searchMessages(conversationId, q);
      if (!live) return;
      if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [q, conversationId]);
  return (
    <div className="csearch">
      <label className="chat-find">
        <Search size={18} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this chat" aria-label="Search this chat" />
        <button type="button" className="icon-btn" aria-label="Close search" onClick={onClose}><X size={18} /></button>
      </label>
      {err ? <div className="alert err">{err}</div> : null}
      {rows && rows.length === 0 ? <div className="empty"><p>No matches.</p></div> : null}
      {rows && rows.length > 0 ? (
        <div className="rows cres">
          {rows.map((m) => (
            <button type="button" className="row" key={m.id} onClick={() => onJump(m)}>
              <div className="row-main"><b>{m.body}</b><span>{dayLabel(m.created_at)} {clock(m.created_at)}</span></div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

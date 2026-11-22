import React, { useEffect, useState } from 'react';
import Sheet from './Sheet';
import Avatar from './ui/Avatar';
import { forwardMessage, listConversations } from '../lib/api';
import { fullName } from '../lib/format';

export default function ForwardPicker({ message, onClose, onDone }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    listConversations().then((r) => { if (r.ok) setRows(r.data || []); else setErr(r.error); });
  }, []);
  const go = async (c) => {
    setBusy(c.id); setErr('');
    const r = await forwardMessage(message.id, c.id, crypto.randomUUID());
    setBusy('');
    if (r.ok) onDone(c); else setErr(r.error);
  };
  return (
    <Sheet title="Forward to" onClose={onClose}>
      <div className="quote-prev">{message.body.slice(0, 140)}</div>
      {err ? <div className="alert err">{err}</div> : null}
      {!rows && !err ? <div className="empty"><p>Loading...</p></div> : null}
      {rows && rows.length === 0 ? <div className="empty"><p>No conversations yet.</p></div> : null}
      <div className="rows">
        {(rows || []).map((c) => (
          <button type="button" className="row" key={c.id} disabled={Boolean(busy)} onClick={() => go(c)}>
            <Avatar name={fullName(c.other)} url={c.other.avatar_url} size={42} />
            <div className="row-main"><b>{fullName(c.other)}</b><span>{c.other.is_group ? c.other.members + ' members' : '@' + c.other.username}</span></div>
            {busy === c.id ? <span className="row-time">Sending...</span> : null}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

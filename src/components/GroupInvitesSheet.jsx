import React, { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import Skeleton from './ui/Skeleton';
import Sheet from './Sheet';
import Avatar from './ui/Avatar';
import { listMyGroupInvites, respondGroupInvite } from '../lib/api';

export default function GroupInvitesSheet({ onClose, onJoined }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const r = await listMyGroupInvites();
    if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  const answer = async (i, ok) => {
    const r = await respondGroupInvite(i.id, ok);
    if (!r.ok) { setErr(r.error); return; }
    if (ok) onJoined(r.data.conversation_id); else load();
  };
  return (
    <Sheet title="Group invitations" onClose={onClose}>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}>Retry</button></div> : null}
      {!rows && !err ? <Skeleton /> : null}
      {rows && rows.length === 0 ? <p className="note">No pending invitations.</p> : null}
      {(rows || []).map((i) => (
        <div className="row static" key={i.id}>
          <Avatar name={i.name || 'Group'} url={i.avatar_url} size={40} />
          <div className="row-main"><b>{i.name || 'Group'}</b><span>Invited by {i.from_name}</span></div>
          <button type="button" className="icon-btn" aria-label={'Accept ' + i.name} onClick={() => answer(i, true)}><Check size={18} /></button>
          <button type="button" className="icon-btn" aria-label={'Decline ' + i.name} onClick={() => answer(i, false)}><X size={18} /></button>
        </div>
      ))}
    </Sheet>
  );
}

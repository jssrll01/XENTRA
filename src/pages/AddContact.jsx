import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MessageCircle, RefreshCw, UserPlus } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import { lookupCode, sendContactRequest, startDirect } from '../lib/api';
import { fullName } from '../lib/format';

const STATE = {
  self: 'This is your own code.',
  contact: 'Already in your contacts.',
  incoming: 'Wants to connect with you.',
  outgoing: 'Request sent. Waiting for a reply.',
  blocked: 'You blocked this person. Unblock them in Contacts to connect.',
};

export default function AddContact() {
  const { code } = useParams();
  const nav = useNavigate();
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await lookupCode(code);
    if (r.ok) { setP(r.data); setErr(''); } else setErr(r.error);
  }, [code]);
  useEffect(() => { load(); }, [load]);
  const send = async () => {
    setBusy(true);
    const r = await sendContactRequest(p.id);
    setBusy(false);
    if (r.ok) { setNote(r.data.status === 'accepted' ? 'You are now contacts.' : 'Request sent.'); load(); } else setErr(r.error);
  };
  const message = async () => {
    setBusy(true);
    const r = await startDirect(p.id);
    setBusy(false);
    if (r.ok) nav('/messages/' + r.data.id); else setErr(r.error);
  };
  return (
    <section className="glass card add-card">
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {note ? <div className="alert info">{note}</div> : null}
      {!p && !err ? <div className="empty pulse">Loading...</div> : null}
      {p ? (
        <>
          <Avatar name={fullName(p)} url={p.avatar_url} size={72} />
          <h2>{fullName(p)}</h2>
          <span>@{p.username}</span>
          {p.relation ? <span className="rel-tag">{STATE[p.relation]}</span> : null}
          {!p.relation ? <button type="button" className="btn btn-primary" disabled={busy} onClick={send}><UserPlus size={18} /> Send contact request</button> : null}
          {p.relation === 'incoming' ? <button type="button" className="btn btn-primary" disabled={busy} onClick={send}><UserPlus size={18} /> Accept request</button> : null}
          {p.relation === 'contact' ? <button type="button" className="btn btn-primary" disabled={busy} onClick={message}><MessageCircle size={18} /> Message</button> : null}
        </>
      ) : null}
      <Link className="see-all" to="/contacts">Back to contacts</Link>
    </section>
  );
}

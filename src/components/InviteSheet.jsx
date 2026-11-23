import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Mail, Trash2, UserPlus } from 'lucide-react';
import Skeleton from './ui/Skeleton';
import Sheet from './Sheet';
import { createInvite, listMyInvites, revokeInvite } from '../lib/api';

const link = (code) => window.location.origin + '/invite/' + code;
const day = (iso) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
const mailto = (i) => 'mailto:' + encodeURIComponent(i.email) + '?subject=' + encodeURIComponent('Join me on XENTRA') + '&body=' + encodeURIComponent('Join me on XENTRA: ' + link(i.code));

export default function InviteSheet({ onClose }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await listMyInvites();
    if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  const create = async () => {
    setBusy(true); setErr(''); setNote('');
    const r = await createInvite(email);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setEmail('');
    await load();
  };
  const copy = async (code) => {
    setErr(''); setNote('');
    try { await navigator.clipboard.writeText(link(code)); setNote('Invite link copied.'); } catch (x) { setErr('Could not copy the link.'); }
  };
  const revoke = async (i) => {
    const r = await revokeInvite(i.id);
    if (r.ok) load(); else setErr(r.error);
  };
  return (
    <Sheet title="Invite someone" onClose={onClose}>
      <p className="note">Invite a person who is not on XENTRA yet. When they join through your link, you get a contact request from them.</p>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}>Retry</button></div> : null}
      {note ? <div className="alert info" role="status">{note}</div> : null}
      <div className="lbl-row">
        <input type="email" placeholder="Email (optional)" aria-label="Invite email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={create}><UserPlus size={16} /> {busy ? 'Creating...' : 'Create'}</button>
      </div>
      <h3 className="sub-h">Your invites</h3>
      {!rows && !err ? <Skeleton /> : null}
      {rows && rows.length === 0 ? <p className="note">No invites yet.</p> : null}
      {rows && rows.length > 0 ? (
        <div className="rows">
          {rows.map((i) => (
            <div className="row static" key={i.id}>
              <div className="row-main">
                <b>{i.email || 'Link invite'}</b>
                <span>{i.status === 'accepted' ? 'Accepted by ' + (i.accepted_name || 'a new member') : i.status === 'expired' ? 'Expired' : 'Open, expires ' + day(i.expires_at)}</span>
              </div>
              {i.status === 'open' ? (
                <>
                  <button type="button" className="icon-btn" aria-label="Copy invite link" onClick={() => copy(i.code)}><Copy size={18} /></button>
                  {i.email ? <a className="icon-btn" aria-label={'Email ' + i.email} href={mailto(i)}><Mail size={18} /></a> : null}
                  <button type="button" className="icon-btn" aria-label="Revoke invite" onClick={() => revoke(i)}><Trash2 size={18} /></button>
                </>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </Sheet>
  );
}

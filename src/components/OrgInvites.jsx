import { appOrigin } from '../lib/appUrl';
import React, { useCallback, useEffect, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import Skeleton from './ui/Skeleton';
import InviteQr from './InviteQr';
import { TeamErr } from './TeamSub';
import { ask } from '../lib/dialog';
import { createOrgInvite, listOrgInvites, revokeOrgInvite, regenerateOrgCode, setOrgInviteEnabled, listOrgJoinRequests, respondOrgJoinRequest } from '../lib/api';
import { fullName } from '../lib/format';

export default function OrgInvites({ org, tick, onChanged }) {
  const [inv, setInv] = useState(null);
  const [req, setReq] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('username');
  const [val, setVal] = useState('');
  const link = org.invite_code ? appOrigin() + '/o/' + org.invite_code : '';
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([listOrgInvites(org.id), listOrgJoinRequests(org.id)]);
    if (!a.ok) { setErr(a.error); return; }
    if (!b.ok) { setErr(b.error); return; }
    setInv(a.data || []); setReq(b.data || []); setErr('');
  }, [org.id]);
  useEffect(() => { load(); }, [load, tick]);
  const run = async (pr, msg, after) => {
    setBusy(true); setNote('');
    const r = await pr;
    setBusy(false);
    if (!r.ok) { setErr(r.error); return false; }
    setErr(''); if (msg) setNote(msg); load(); if (after) after();
    return true;
  };
  const send = async () => {
    const t = val.trim().replace(/^@/, '');
    if (await run(createOrgInvite(org.id, mode === 'username' ? t : null, mode === 'email' ? t : null, null), 'Invitation sent')) setVal('');
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setNote('Link copied'); } catch (x) { setNote('Copy is not available here'); }
  };
  const regen = async () => { if (await ask('Create a new link? The old link stops working.', 'Create')) run(regenerateOrgCode(org.id), 'New link created', onChanged); };
  return (
    <>
      {err ? <TeamErr msg={err} retry={load} /> : null}
      {note ? <div className="alert info" role="status">{note}</div> : null}
      <section className="tm-card">
        <p className="tm-label">Invite a person</p>
        <div className="tm-btnrow">
          <button type="button" className={'tm-btn' + (mode === 'username' ? ' primary' : '')} onClick={() => { setMode('username'); setVal(''); }}>Username</button>
          <button type="button" className={'tm-btn' + (mode === 'email' ? ' primary' : '')} onClick={() => { setMode('email'); setVal(''); }}>Email</button>
        </div>
        <input className="tm-input" aria-label={mode === 'email' ? 'Email address' : 'Username'} type={mode === 'email' ? 'email' : 'text'} placeholder={mode === 'email' ? 'name@gmail.com' : 'username'} value={val} onChange={(e) => setVal(e.target.value)} />
        {mode === 'email' ? <p className="tm-hint">XENTRA does not send email. Share the invite link below; the person sees the invitation after signing in with that email.</p> : null}
        <button type="button" className="tm-btn primary block" disabled={busy || !val.trim()} onClick={send}>Send invitation</button>
      </section>
      <section className="tm-card">
        <p className="tm-label">Pending invitations</p>
        {!inv && !err ? <Skeleton rows={1} /> : null}
        {inv && inv.length === 0 ? <p className="tm-hint">No pending invitations.</p> : null}
        {inv && inv.length > 0 ? (
          <div className="tm-list">
            {inv.map((i) => (
              <div className="tm-row static" key={i.id}>
                <div className="tm-main"><b>{i.target}</b><span>Expires {new Date(i.expires_at).toLocaleDateString()}</span></div>
                <button type="button" className="tm-btn" disabled={busy} onClick={() => run(revokeOrgInvite(i.id))}>Revoke</button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
      {req && req.length > 0 ? (
        <section className="tm-card">
          <p className="tm-label">Join requests</p>
          <div className="tm-list">
            {req.map((r) => (
              <div className="tm-row static" key={r.user_id}>
                <div className="tm-main"><b>{fullName(r)}</b><span>@{r.username}</span></div>
                <button type="button" className="tm-btn" disabled={busy} onClick={() => run(respondOrgJoinRequest(org.id, r.user_id, false))}>Decline</button>
                <button type="button" className="tm-btn primary" disabled={busy} onClick={() => run(respondOrgJoinRequest(org.id, r.user_id, true))}>Approve</button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <section className="tm-card tm-center">
        <p className="tm-label">Invite link</p>
        {org.invite_enabled ? (
          <>
            <p className="org-link">{link}</p>
            <InviteQr link={link} alt="Organization invite QR code" />
            <div className="tm-btnrow">
              <button type="button" className="tm-btn" onClick={copy}><Copy size={16} /> Copy</button>
              <button type="button" className="tm-btn" disabled={busy} onClick={regen}><RefreshCw size={16} /> New link</button>
              <button type="button" className="tm-btn" disabled={busy} onClick={() => run(setOrgInviteEnabled(org.id, false), 'Link turned off', onChanged)}>Turn off</button>
            </div>
          </>
        ) : (
          <>
            <p className="tm-hint">The invite link is off.</p>
            <button type="button" className="tm-btn primary" disabled={busy} onClick={() => run(setOrgInviteEnabled(org.id, true), 'Link turned on', onChanged)}>Turn on</button>
          </>
        )}
      </section>
    </>
  );
}

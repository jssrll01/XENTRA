import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ChevronRight, Mail, Plus } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import Sheet from '../components/Sheet';
import { TeamErr } from '../components/TeamSub';
import { listMyOrgs, listMyOrgInvites, respondOrgInvite, createOrg } from '../lib/api';
import { useSummary } from '../lib/summary';

export default function Organizations() {
  const nav = useNavigate();
  const { tick } = useSummary();
  const [orgs, setOrgs] = useState(null);
  const [invs, setInvs] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([listMyOrgs(), listMyOrgInvites()]);
    if (!a.ok) { setErr(a.error); return; }
    if (!b.ok) { setErr(b.error); return; }
    setOrgs(a.data || []); setInvs(b.data || []); setErr('');
  }, []);
  useEffect(() => { load(); }, [load, tick]);
  const respond = async (i, accept) => {
    setBusy(i.id); setNote('');
    const r = await respondOrgInvite(i.id, accept);
    setBusy('');
    if (!r.ok) {
      if (/policy/i.test(r.error)) setNote('This organization requires you to accept its policy. Open the invite link from the person who invited you.');
      else setErr(r.error);
      return;
    }
    if (accept && r.data && r.data.org_id) nav('/organizations/' + r.data.org_id); else load();
  };
  const create = async () => {
    setBusy('new');
    const r = await createOrg(name, desc);
    setBusy('');
    if (!r.ok) { setErr(r.error); return; }
    setOpen(false); setName(''); setDesc('');
    nav('/organizations/' + r.data.id);
  };
  return (
    <div className="org">
      <div className="page-head">
        <h2>Organizations</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}><Plus size={16} /> New</button>
      </div>
      {err ? <TeamErr msg={err} retry={load} /> : null}
      {note ? <div className="alert info">{note}</div> : null}
      {!orgs && !err ? <Skeleton /> : null}
      {invs && invs.length > 0 ? (
        <section className="tm-card">
          <p className="tm-label">Invitations</p>
          <div className="tm-list">
            {invs.map((i) => (
              <div className="tm-row static" key={i.id}>
                <span className="tm-ic"><Mail size={20} /></span>
                <div className="tm-main"><b>{i.org_name}</b><span>{i.from ? 'From ' + i.from : 'Invitation'}</span></div>
                <button type="button" className="tm-btn" disabled={busy === i.id} onClick={() => respond(i, false)}>Decline</button>
                <button type="button" className="tm-btn primary" disabled={busy === i.id} onClick={() => respond(i, true)}>Accept</button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {orgs && orgs.length === 0 ? <EmptyState icon={Building2} title="No organizations yet" text="Create one, or open an invite link to join." /> : null}
      {orgs && orgs.length > 0 ? (
        <section className="tm-card">
          <p className="tm-label">Your organizations</p>
          <div className="tm-list">
            {orgs.map((o) => (
              <button type="button" className="tm-row" key={o.id} onClick={() => nav('/organizations/' + o.id)}>
                <Avatar name={o.name} url={o.logo_url} size={40} />
                <div className="tm-main"><b>{o.name}</b><span>{o.members} {o.members === 1 ? 'member' : 'members'} - {o.role}</span></div>
                <ChevronRight size={18} className="tm-chev" />
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {open ? (
        <Sheet title="New organization" onClose={() => setOpen(false)}>
          <div className="tm-sheet">
            <label className="tm-lbl">Name<input className="tm-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
            <label className="tm-lbl">Description<textarea className="tm-input" rows={3} maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
            <button type="button" className="tm-btn primary block" disabled={busy === 'new' || name.trim().length < 2} onClick={create}>Create</button>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

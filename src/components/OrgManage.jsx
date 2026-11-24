import React, { useRef, useState } from 'react';
import { Camera, ChevronRight, FileText, History, Megaphone, Settings, Shield, UserPlus } from 'lucide-react';
import Avatar from './ui/Avatar';
import TeamSub, { TeamErr } from './TeamSub';
import OrgInvites from './OrgInvites';
import OrgRoles from './OrgRoles';
import OrgPolicy, { OrgAudit } from './OrgPolicy';
import OrgAnnounce from './OrgAnnounce';
import { uploadAvatar } from '../lib/cloudinary';
import { updateOrg, setOrgLogo } from '../lib/api';

const isAdmin = (o) => o.my_role === 'owner' || o.my_role === 'admin';
const sections = (o) => {
  const p = o.perms || {};
  return [
    ['details', 'Details', 'Name, description and logo', Settings, isAdmin(o)],
    ['invites', 'Invitations', 'Invite people and manage the link', UserPlus, p.manage_invitations],
    ['roles', 'Roles and permissions', 'Built-in and custom roles', Shield, p.manage_roles],
    ['policy', 'Policies', 'Invite rules and the organization policy', FileText, p.edit_policies],
    ['announce', 'Announcements', 'Post, schedule and pin updates', Megaphone, p.post_announcements],
    ['audit', 'Audit log', 'Who changed what', History, p.view_audit],
  ].filter((s) => s[4]);
};
export const canManageOrg = (o) => sections(o).length > 0;

function Details({ org, onChanged }) {
  const [name, setName] = useState(org.name);
  const [desc, setDesc] = useState(org.description || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const file = useRef(null);
  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true); setNote('');
    const u = await uploadAvatar(f);
    if (!u.ok) { setBusy(false); setErr(u.error); return; }
    const r = await setOrgLogo(org.id, u.data);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setErr(''); setNote('Logo updated'); onChanged();
  };
  const save = async () => {
    setBusy(true); setNote('');
    const r = await updateOrg(org.id, name, desc);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setErr(''); setNote('Saved'); onChanged();
  };
  return (
    <section className="tm-card tm-center">
      {err ? <TeamErr msg={err} retry={save} /> : null}
      {note ? <div className="alert info" role="status">{note}</div> : null}
      <Avatar name={org.name} url={org.logo_url} size={72} />
      <input ref={file} type="file" accept="image/*" hidden onChange={pick} />
      <button type="button" className="tm-btn" disabled={busy} onClick={() => file.current && file.current.click()}><Camera size={16} /> Change logo</button>
      <label className="tm-lbl tm-full">Name<input className="tm-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
      <label className="tm-lbl tm-full">Description<textarea className="tm-input" rows={3} maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
      <button type="button" className="tm-btn primary block" disabled={busy || name.trim().length < 2} onClick={save}>Save</button>
    </section>
  );
}

export default function OrgManage({ org, tick, onChanged }) {
  const [sub, setSub] = useState('');
  const list = sections(org);
  const cur = list.find((s) => s[0] === sub);
  if (cur) {
    const back = () => setSub('');
    return (
      <TeamSub title={cur[1]} onBack={back}>
        {sub === 'details' ? <Details org={org} onChanged={onChanged} /> : null}
        {sub === 'invites' ? <OrgInvites org={org} tick={tick} onChanged={onChanged} /> : null}
        {sub === 'roles' ? <OrgRoles org={org} tick={tick} /> : null}
        {sub === 'policy' ? <OrgPolicy org={org} tick={tick} /> : null}
        {sub === 'announce' ? <OrgAnnounce org={org} tick={tick} /> : null}
        {sub === 'audit' ? <OrgAudit org={org} tick={tick} /> : null}
      </TeamSub>
    );
  }
  return (
    <section className="tm-card"><div className="tm-list">
      {list.map(([k, title, sub2, Icon]) => (
        <button type="button" className="tm-row" key={k} onClick={() => setSub(k)}>
          <span className="tm-ic"><Icon size={20} /></span>
          <div className="tm-main"><b>{title}</b><span>{sub2}</span></div>
          <ChevronRight size={18} className="tm-chev" />
        </button>
      ))}
    </div></section>
  );
}

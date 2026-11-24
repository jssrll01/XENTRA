import React, { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Plus, Shield } from 'lucide-react';
import Skeleton from './ui/Skeleton';
import Sheet from './Sheet';
import { TeamErr } from './TeamSub';
import { ask } from '../lib/dialog';
import { listOrgRoles, setOrgBuiltinPerms, saveOrgRole, deleteOrgRole } from '../lib/api';

const RANK = { owner: 3, admin: 2, manager: 1, member: 0 };
const LABEL = {
  manage_members: 'Manage members', manage_roles: 'Manage roles', post_announcements: 'Post announcements',
  edit_policies: 'Edit policies', view_audit: 'View audit log', manage_invitations: 'Manage invitations', manage_sso: 'Manage single sign-on',
};

export default function OrgRoles({ org, tick }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [ed, setEd] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await listOrgRoles(org.id);
    if (r.ok) { setD(r.data); setErr(''); } else setErr(r.error);
  }, [org.id]);
  useEffect(() => { load(); }, [load, tick]);
  const toggle = (k) => setEd((e) => ({ ...e, perms: e.perms.indexOf(k) >= 0 ? e.perms.filter((x) => x !== k) : e.perms.concat(k) }));
  const save = async () => {
    setBusy(true); setNote('');
    const r = ed.kind === 'builtin' ? await setOrgBuiltinPerms(org.id, ed.role, ed.perms) : await saveOrgRole(org.id, ed.id, ed.name, ed.perms);
    setBusy(false);
    if (!r.ok) { setNote(r.error); return; }
    setEd(null); load();
  };
  const del = async () => {
    if (!await ask('Delete the role ' + ed.name + '?', 'Delete')) return;
    setBusy(true);
    const r = await deleteOrgRole(org.id, ed.id);
    setBusy(false);
    if (!r.ok) { setNote(r.error); return; }
    setEd(null); load();
  };
  const open = (e) => { setNote(''); setEd(e); };
  const editable = ed && (ed.kind === 'custom' || RANK[ed.role] < RANK[org.my_role]);
  return (
    <>
      {err ? <TeamErr msg={err} retry={load} /> : null}
      {!d && !err ? <Skeleton /> : null}
      {d ? (
        <>
          <section className="tm-card">
            <p className="tm-label">Built-in roles</p>
            <div className="tm-list">
              {['admin', 'manager', 'member'].map((r) => (
                <button type="button" className="tm-row" key={r} onClick={() => open({ kind: 'builtin', role: r, name: r, perms: d.builtin[r] })}>
                  <span className="tm-ic"><Shield size={20} /></span>
                  <div className="tm-main"><b style={{ textTransform: 'capitalize' }}>{r}</b><span>{d.builtin[r].length} permissions</span></div>
                  <ChevronRight size={18} className="tm-chev" />
                </button>
              ))}
            </div>
          </section>
          <section className="tm-card">
            <p className="tm-label">Custom roles</p>
            {d.custom.length === 0 ? <p className="tm-hint">No custom roles yet.</p> : (
              <div className="tm-list">
                {d.custom.map((c) => (
                  <button type="button" className="tm-row" key={c.id} onClick={() => open({ kind: 'custom', id: c.id, name: c.name, perms: c.perms })}>
                    <div className="tm-main"><b>{c.name}</b><span>{c.members} {c.members === 1 ? 'member' : 'members'} - {c.perms.length} permissions</span></div>
                    <ChevronRight size={18} className="tm-chev" />
                  </button>
                ))}
              </div>
            )}
            <button type="button" className="tm-btn block" onClick={() => open({ kind: 'custom', id: null, name: '', perms: [] })}><Plus size={16} /> New role</button>
          </section>
        </>
      ) : null}
      {ed ? (
        <Sheet title={ed.kind === 'builtin' ? 'Role: ' + ed.name : ed.id ? 'Edit role' : 'New role'} onClose={() => setEd(null)}>
          <div className="tm-sheet">
            {note ? <div className="alert err">{note}</div> : null}
            {ed.kind === 'custom' ? <label className="tm-lbl">Name<input className="tm-input" value={ed.name} maxLength={24} onChange={(e) => setEd({ ...ed, name: e.target.value })} /></label> : null}
            {!editable ? <p className="tm-hint">You can only edit roles below yours.</p> : null}
            {d.all.map((k) => (
              <label className="org-check" key={k}>
                <input type="checkbox" checked={ed.perms.indexOf(k) >= 0} disabled={!editable || busy || !(org.perms && org.perms[k])} onChange={() => toggle(k)} /> {LABEL[k] || k}
              </label>
            ))}
            {editable ? <button type="button" className="tm-btn primary block" disabled={busy || (ed.kind === 'custom' && !ed.name.trim())} onClick={save}>Save</button> : null}
            {ed.kind === 'custom' && ed.id ? <button type="button" className="tm-btn danger block" disabled={busy} onClick={del}>Delete role</button> : null}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

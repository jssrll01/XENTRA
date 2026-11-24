import React, { useCallback, useEffect, useState } from 'react';
import { Search as SearchIcon, Users } from 'lucide-react';
import Avatar from './ui/Avatar';
import EmptyState from './ui/EmptyState';
import Skeleton from './ui/Skeleton';
import Sheet from './Sheet';
import { TeamErr } from './TeamSub';
import { ask } from '../lib/dialog';
import { listOrgMembers, listOrgRoles, setOrgMemberRole, assignOrgRole, removeOrgMember, transferOrg } from '../lib/api';
import { fullName } from '../lib/format';

const RANK = { owner: 3, admin: 2, manager: 1, member: 0 };

export default function OrgMembers({ org, tick, onChanged }) {
  const [rows, setRows] = useState(null);
  const [roles, setRoles] = useState(null);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [err, setErr] = useState('');
  const [sel, setSel] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = RANK[org.my_role];
  const p = org.perms || {};
  const load = useCallback(async () => {
    const r = await listOrgMembers(org.id, q, role);
    if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
  }, [org.id, q, role]);
  const loadRoles = useCallback(async () => {
    const r = await listOrgRoles(org.id);
    if (r.ok) setRoles(r.data); else setErr(r.error);
  }, [org.id]);
  useEffect(() => { loadRoles(); }, [loadRoles, tick]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load, tick]);
  const actionable = (m) => m.id !== org.me && RANK[m.role] < mine && (p.manage_members || p.manage_roles || org.my_role === 'owner');
  const run = async (pr, after) => {
    setBusy(true); setNote('');
    const r = await pr;
    setBusy(false);
    if (!r.ok) { setNote(r.error); return; }
    setSel(null); load(); if (after) after();
  };
  const transfer = async () => {
    if (!await ask('Transfer ownership to ' + fullName(sel) + '? You will become an admin.', 'Transfer')) return;
    run(transferOrg(org.id, sel.id), onChanged);
  };
  const remove = async () => {
    if (!await ask('Remove ' + fullName(sel) + ' from the organization?', 'Remove')) return;
    run(removeOrgMember(org.id, sel.id), onChanged);
  };
  const curCustom = sel && roles ? ((roles.custom.find((x) => x.name === sel.custom_role) || {}).id || '') : '';
  return (
    <>
      <label className="tm-search"><SearchIcon size={18} /><input type="search" aria-label="Search members" placeholder="Search members" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <select className="tm-input" aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)}>
        <option value="">All roles</option>
        <option value="owner">Owner</option>
        <option value="admin">Admin</option>
        <option value="manager">Manager</option>
        <option value="member">Member</option>
        {roles ? roles.custom.map((c) => <option key={c.id} value={c.id}>{c.name}</option>) : null}
      </select>
      {err ? <TeamErr msg={err} retry={() => { load(); loadRoles(); }} /> : null}
      {!rows && !err ? <Skeleton /> : null}
      {rows && rows.length === 0 ? <EmptyState icon={Users} title="No members found" text="Try a different search or role." /> : null}
      {rows && rows.length > 0 ? (
        <section className="tm-card"><div className="tm-list">
          {rows.map((m) => {
            const body = (
              <>
                <Avatar name={fullName(m)} size={40} />
                <div className="tm-main"><b>{fullName(m)}</b><span>@{m.username}{m.custom_role ? ' - ' + m.custom_role : ''}</span></div>
                <span className="tm-role">{m.role}</span>
              </>
            );
            return actionable(m)
              ? <button type="button" className="tm-row" key={m.id} onClick={() => { setNote(''); setSel(m); }}>{body}</button>
              : <div className="tm-row static" key={m.id}>{body}</div>;
          })}
        </div></section>
      ) : null}
      {sel ? (
        <Sheet title={fullName(sel)} onClose={() => setSel(null)}>
          <div className="tm-sheet">
            {note ? <div className="alert err">{note}</div> : null}
            {p.manage_roles ? (
              <>
                <p className="tm-label">Role</p>
                <div className="tm-btnrow">
                  {['admin', 'manager', 'member'].filter((r) => RANK[r] < mine).map((r) => (
                    <button type="button" key={r} className={'tm-btn' + (sel.role === r ? ' primary' : '')} disabled={busy || sel.role === r} onClick={() => run(setOrgMemberRole(org.id, sel.id, r))}>{r}</button>
                  ))}
                </div>
                {roles && roles.custom.length > 0 ? (
                  <label className="tm-lbl">Custom role
                    <select className="tm-input" value={curCustom} disabled={busy} onChange={(e) => run(assignOrgRole(org.id, sel.id, e.target.value || null))}>
                      <option value="">None</option>
                      {roles.custom.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                ) : null}
              </>
            ) : null}
            {org.my_role === 'owner' ? <button type="button" className="tm-btn block" disabled={busy} onClick={transfer}>Transfer ownership</button> : null}
            {p.manage_members ? <button type="button" className="tm-btn danger block" disabled={busy} onClick={remove}>Remove from organization</button> : null}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

import { ask } from '../lib/dialog';
import React, { useCallback, useEffect, useState } from 'react';
import { Shield, Trash2 } from 'lucide-react';
import Skeleton from './ui/Skeleton';
import EmptyState from './ui/EmptyState';
import { TeamErr } from './TeamSub';
import { listTeamRoles, saveTeamRole, deleteTeamRole } from '../lib/api';

const PERMS = [['edit_posts', 'Edit posts'], ['pin_posts', 'Pin posts'], ['delete_messages', 'Delete channel messages']];

export default function TeamRoles({ team, tick }) {
  const [roles, setRoles] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const load = useCallback(async () => {
    const r = await listTeamRoles(team.id);
    if (r.ok) { setRoles(r.data || []); setErr(''); } else setErr(r.error);
  }, [team.id]);
  useEffect(() => { load(); }, [load, tick]);
  const run = async (p) => {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (r.ok) { setErr(''); await load(); return true; }
    setErr(r.error);
    return false;
  };
  const add = async () => { if (await run(saveTeamRole(team.id, null, name, {}))) setName(''); };
  return (
    <>
      {err ? <TeamErr msg={err} retry={load} /> : null}
      {!roles && !err ? <Skeleton rows={2} /> : null}
      {roles ? (
        <section className="tm-card">
          <h3 className="tm-label">Roles</h3>
          {roles.length === 0 ? <EmptyState icon={Shield} title="No custom roles yet" text="Roles give regular members extra rights. Assign them from the Members tab." /> : null}
          {roles.map((r) => (
            <div className="tm-chrow" key={r.id}>
              <div className="tm-rolehead">
                <div className="tm-main"><b>{r.name}</b><span>{r.members} members</span></div>
                <button type="button" className="tm-ib" aria-label={'Delete role ' + r.name} disabled={busy} onClick={async () => { if (await ask('Delete the role ' + r.name + '? Members lose its rights.')) run(deleteTeamRole(team.id, r.id)); }}><Trash2 size={18} /></button>
              </div>
              {PERMS.map(([k, l]) => (
                <button type="button" role="switch" aria-checked={!!r[k]} key={k} className="tm-sw" disabled={busy} onClick={() => run(saveTeamRole(team.id, r.id, null, { [k]: !r[k] }))}>
                  <span className="tm-main"><b>{l}</b></span><i className="tm-track" />
                </button>
              ))}
            </div>
          ))}
        </section>
      ) : null}
      <section className="tm-card">
        <h3 className="tm-label">New role</h3>
        <div className="tm-add">
          <input className="tm-input" placeholder="Role name" aria-label="New role name" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="button" className="tm-btn primary" disabled={busy || !name.trim()} onClick={add}>Add</button>
        </div>
      </section>
    </>
  );
}

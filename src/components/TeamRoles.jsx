import { ask } from '../lib/dialog';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
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
    <section className="glass card">
      <div className="card-head"><h2>Custom roles</h2></div>
      <span className="note">Roles give regular members extra rights. Assign them from the Members tab.</span>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {roles && roles.length === 0 ? <p className="note">No custom roles yet.</p> : null}
      {(roles || []).map((r) => (
        <div className="row static" key={r.id}>
          <div className="row-main"><b>{r.name}</b><span>{r.members} members</span>
            <span className="filter-row">
              {PERMS.map(([k, l]) => <button type="button" role="switch" aria-checked={!!r[k]} key={k} className={'chip' + (r[k] ? ' on' : '')} disabled={busy} onClick={() => run(saveTeamRole(team.id, r.id, null, { [k]: !r[k] }))}>{l}</button>)}
            </span>
          </div>
          <button type="button" className="icon-btn" aria-label={'Delete role ' + r.name} disabled={busy} onClick={async () => { if (await ask('Delete the role ' + r.name + '? Members lose its rights.')) run(deleteTeamRole(team.id, r.id)); }}><Trash2 size={18} /></button>
        </div>
      ))}
      <div className="lbl-row">
        <input type="text" placeholder="New role name" aria-label="New role name" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !name.trim()} onClick={add}>Add</button>
      </div>
    </section>
  );
}

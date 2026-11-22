import React, { useCallback, useEffect, useState } from 'react';
import { Ban, Crown, RefreshCw, UserMinus, Volume2, VolumeX } from 'lucide-react';
import Avatar from './ui/Avatar';
import { listTeamMembers, setTeamRole, transferTeamOwner, kickMember, banMember, muteMember } from '../lib/api';
import { fullName } from '../lib/format';

const RANK = { owner: 3, admin: 2, moderator: 1, member: 0 };

export default function TeamMembers({ team, tick }) {
  const mine = RANK[team.my_role];
  const owner = team.my_role === 'owner';
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await listTeamMembers(team.id);
    if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
  }, [team.id]);
  useEffect(() => { load(); }, [load, tick]);
  const run = async (p) => {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (r.ok) load(); else setErr(r.error);
  };
  return (
    <>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {!rows && !err ? <div className="empty pulse">Loading...</div> : null}
      {rows ? (
        <section className="glass card"><div className="rows">
          {rows.map((m) => {
            const me = m.id === team.me;
            const act = !me && mine > RANK[m.role];
            return (
              <div className="row static" key={m.id}>
                <Avatar name={fullName(m)} url={m.avatar_url} size={44} />
                <div className="row-main"><b>{fullName(m)}{me ? ' (you)' : ''}</b><span>@{m.username}{m.muted ? ' - muted' : ''}</span></div>
                {m.role !== 'member' ? <span className="rel-tag">{m.role}</span> : null}
                <span className="req-acts">
                  {owner && !me ? (
                    <select aria-label={'Role for ' + fullName(m)} value={m.role} disabled={busy} onChange={(e) => run(setTeamRole(team.id, m.id, e.target.value))}>
                      <option value="admin">admin</option><option value="moderator">moderator</option><option value="member">member</option>
                    </select>
                  ) : null}
                  {owner && !me ? <button type="button" className="icon-btn" aria-label="Transfer ownership" disabled={busy} onClick={() => { if (window.confirm('Make ' + fullName(m) + ' the owner? You become an admin.')) run(transferTeamOwner(team.id, m.id)); }}><Crown size={18} /></button> : null}
                  {act ? <button type="button" className="icon-btn" aria-label={m.muted ? 'Unmute ' + fullName(m) : 'Mute ' + fullName(m)} disabled={busy} onClick={() => run(muteMember(team.id, m.id, !m.muted))}>{m.muted ? <Volume2 size={18} /> : <VolumeX size={18} />}</button> : null}
                  {act ? <button type="button" className="icon-btn" aria-label={'Remove ' + fullName(m)} disabled={busy} onClick={() => { if (window.confirm('Remove ' + fullName(m) + ' from the team?')) run(kickMember(team.id, m.id)); }}><UserMinus size={18} /></button> : null}
                  {act ? <button type="button" className="icon-btn" aria-label={'Ban ' + fullName(m)} disabled={busy} onClick={() => { if (window.confirm('Ban ' + fullName(m) + '? They cannot rejoin until unbanned.')) run(banMember(team.id, m.id)); }}><Ban size={18} /></button> : null}
                </span>
              </div>
            );
          })}
        </div></section>
      ) : null}
    </>
  );
}

import { ask, promptText } from '../lib/dialog';
import React, { useCallback, useEffect, useState } from 'react';
import Select from './ui/Select';
import Skeleton from './ui/Skeleton';
import { Award, Ban, Crown, RefreshCw, UserMinus, Volume2, VolumeX } from 'lucide-react';
import Avatar from './ui/Avatar';
import { listTeamMembers, setTeamRole, transferTeamOwner, kickMember, banMember, muteMember, muteMemberFor, awardTeamBadge, removeTeamBadge, listTeamBadges, listTeamRoles, listTeamMemberRoles, assignTeamRole } from '../lib/api';
import { fullName } from '../lib/format';

const RANK = { owner: 3, admin: 2, moderator: 1, member: 0 };

export default function TeamMembers({ team, tick }) {
  const mine = RANK[team.my_role];
  const owner = team.my_role === 'owner';
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [bd, setBd] = useState({});
  const [cr, setCr] = useState({});
  const [roles, setRoles] = useState([]);
  const [flt, setFlt] = useState('');
  const staff = mine >= RANK.admin;
  const muteWith = async (m, on) => {
    if (!on) return muteMember(team.id, m.id, false);
    const v = await promptText('Mute ' + fullName(m) + ' for how many minutes? (5 to 43200)', '60');
    if (!v) return { ok: true, data: {} };
    return muteMemberFor(team.id, m.id, parseInt(v, 10) || 0);
  };
  const badge = async (m) => {
    const l = await promptText('Badge for ' + fullName(m) + ' (up to 24 characters). Type - to remove the last badge.');
    if (!l || !l.trim()) return { ok: true, data: {} };
    if (l.trim() === '-') {
      const list = bd[m.id] || [];
      if (!list.length) return { ok: false, error: 'No badges to remove.' };
      return removeTeamBadge(list[list.length - 1].id);
    }
    return awardTeamBadge(team.id, m.id, l);
  };
  const load = useCallback(async () => {
    const r = await listTeamMembers(team.id);
    if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
  }, [team.id]);
  useEffect(() => { load(); }, [load, tick]);
  useEffect(() => {
    let live = true;
    listTeamBadges(team.id).then((r) => { if (live && r.ok) setBd(r.data || {}); });
    return () => { live = false; };
  }, [team.id, tick, rows]);
  useEffect(() => {
    let live = true;
    listTeamMemberRoles(team.id).then((r) => { if (live && r.ok) setCr(r.data || {}); });
    listTeamRoles(team.id).then((r) => { if (live && r.ok) setRoles(r.data || []); });
    return () => { live = false; };
  }, [team.id, tick, rows]);
  const run = async (p) => {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (r.ok) load(); else setErr(r.error);
  };
  return (
    <>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {!rows && !err ? <Skeleton /> : null}
      {rows ? (
        <section className="glass card">
            <div className="filter-row" role="group" aria-label="Filter by role">
              {[['', 'All'], ['owner', 'Owners'], ['admin', 'Admins'], ['moderator', 'Moderators'], ['member', 'Members']].concat(roles.map((c) => ['c:' + c.id, c.name])).map(([k, l]) => <button type="button" key={k || 'all'} className={'chip' + (flt === k ? ' on' : '')} onClick={() => setFlt(k)}>{l}</button>)}
            </div>
            <div className="rows">
          {rows.filter((m) => !flt || (flt.startsWith('c:') ? !!(cr[m.id] && cr[m.id].id === flt.slice(2)) : m.role === flt)).map((m) => {
            const me = m.id === team.me;
            const act = !me && mine > RANK[m.role];
            return (
              <div className="row static" key={m.id}>
                <Avatar name={fullName(m)} url={m.avatar_url} size={44} />
                <div className="row-main"><b>{fullName(m)}{me ? ' (you)' : ''}</b><span>@{m.username}{m.muted ? ' - muted' : ''}{(bd[m.id] || []).length ? ' - ' + bd[m.id].map((x) => x.label).join(', ') : ''}</span></div>
                {m.role !== 'member' ? <span className="rel-tag">{m.role}</span> : null}
                  {cr[m.id] ? <span className="rel-tag">{cr[m.id].name}</span> : null}
                <span className="req-acts">
                  {staff && m.role === 'member' && roles.length ? (
                      <Select aria-label={'Custom role for ' + fullName(m)} value={cr[m.id] ? cr[m.id].id : ''} disabled={busy} onChange={(e) => run(assignTeamRole(team.id, m.id, e.target.value || null))}>
                        <option value="">No role</option>
                        {roles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                    ) : null}
                    {staff ? <button type="button" className="icon-btn" aria-label={'Badge for ' + fullName(m)} disabled={busy} onClick={() => run(badge(m))}><Award size={18} /></button> : null}
                  {owner && !me ? (
                    <Select aria-label={'Role for ' + fullName(m)} value={m.role} disabled={busy} onChange={(e) => run(setTeamRole(team.id, m.id, e.target.value))}>
                      <option value="admin">admin</option><option value="moderator">moderator</option><option value="member">member</option>
                    </Select>
                  ) : null}
                  {owner && !me ? <button type="button" className="icon-btn" aria-label="Transfer ownership" disabled={busy} onClick={async () => { if (await ask('Make ' + fullName(m) + ' the owner? You become an admin.')) run(transferTeamOwner(team.id, m.id)); }}><Crown size={18} /></button> : null}
                  {act ? <button type="button" className="icon-btn" aria-label={m.muted ? 'Unmute ' + fullName(m) : 'Mute ' + fullName(m)} disabled={busy} onClick={() => run(muteWith(m, !m.muted))}>{m.muted ? <Volume2 size={18} /> : <VolumeX size={18} />}</button> : null}
                  {act ? <button type="button" className="icon-btn" aria-label={'Remove ' + fullName(m)} disabled={busy} onClick={async () => { if (await ask('Remove ' + fullName(m) + ' from the team?')) run(kickMember(team.id, m.id)); }}><UserMinus size={18} /></button> : null}
                  {act ? <button type="button" className="icon-btn" aria-label={'Ban ' + fullName(m)} disabled={busy} onClick={async () => { if (await ask('Ban ' + fullName(m) + '? They cannot rejoin until unbanned.')) run(banMember(team.id, m.id)); }}><Ban size={18} /></button> : null}
                </span>
              </div>
            );
          })}
        </div></section>
      ) : null}
    </>
  );
}

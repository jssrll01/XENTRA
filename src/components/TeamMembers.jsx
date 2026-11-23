import { ask, promptText } from '../lib/dialog';
import React, { useCallback, useEffect, useState } from 'react';
import { Award, Ban, Crown, Ellipsis, Search, UserMinus, Users, Volume2, VolumeX } from 'lucide-react';
import Select from './ui/Select';
import Skeleton from './ui/Skeleton';
import EmptyState from './ui/EmptyState';
import Avatar from './ui/Avatar';
import Sheet from './Sheet';
import { TeamErr } from './TeamSub';
import { listTeamMembers, setTeamRole, transferTeamOwner, kickMember, banMember, muteMember, muteMemberFor, awardTeamBadge, removeTeamBadge, listTeamBadges, listTeamRoles, listTeamMemberRoles, assignTeamRole } from '../lib/api';
import { fullName } from '../lib/format';

const RANK = { owner: 3, admin: 2, moderator: 1, member: 0 };

export default function TeamMembers({ team, tick }) {
  const mine = RANK[team.my_role];
  const owner = team.my_role === 'owner';
  const staff = mine >= RANK.admin;
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [bd, setBd] = useState({});
  const [cr, setCr] = useState({});
  const [roles, setRoles] = useState([]);
  const [flt, setFlt] = useState('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
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
  const need = q.trim().toLowerCase();
  const list = (rows || []).filter((m) => (!flt || (flt.startsWith('c:') ? !!(cr[m.id] && cr[m.id].id === flt.slice(2)) : m.role === flt)) && (!need || (fullName(m) + ' ' + m.username).toLowerCase().indexOf(need) >= 0));
  const can = (m) => staff || (m.id !== team.me && (owner || mine > RANK[m.role]));
  const subline = (m) => ['@' + m.username, m.muted ? 'muted' : '', cr[m.id] ? cr[m.id].name : ''].concat((bd[m.id] || []).map((x) => x.label)).filter(Boolean).join(' - ');
  const filters = [['', 'All members'], ['owner', 'Owners'], ['admin', 'Admins'], ['moderator', 'Moderators'], ['member', 'Members']].concat(roles.map((c) => ['c:' + c.id, c.name]));
  return (
    <div className="tm-stack">
      {err ? <TeamErr msg={err} retry={load} /> : null}
      {!rows && !err ? <Skeleton rows={4} /> : null}
      {rows ? (
        <section className="tm-card">
          <div className="tm-tools">
            <label className="tm-search"><Search size={18} /><input type="search" placeholder="Search members" aria-label="Search members" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <Select aria-label="Filter by role" className="tm-full" value={flt} onChange={(e) => setFlt(e.target.value)}>
              {filters.map(([k, l]) => <option key={k || 'all'} value={k}>{l}</option>)}
            </Select>
          </div>
          {list.length === 0 ? <EmptyState icon={Users} title="No members found" text="Try a different name or role." /> : (
            <div className="tm-list">
              {list.map((m) => (
                <div className="tm-row static" key={m.id}>
                  <Avatar name={fullName(m)} url={m.avatar_url} size={44} />
                  <div className="tm-main"><b>{fullName(m)}{m.id === team.me ? ' (you)' : ''}</b><span>{subline(m)}</span></div>
                  {m.role !== 'member' ? <span className="tm-role">{m.role}</span> : null}
                  {can(m) ? <button type="button" className="tm-ib" aria-label={'Actions for ' + fullName(m)} onClick={() => setSel(m)}><Ellipsis size={20} /></button> : null}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
      {sel ? (() => {
        const m = sel;
        const me = m.id === team.me;
        const act = !me && mine > RANK[m.role];
        const go = (p) => { setSel(null); run(p); };
        return (
          <Sheet title={fullName(m)} onClose={() => setSel(null)}>
            <div className="tm-sheet">
              {owner && !me ? (
                <div className="tm-lbl">Role
                  <Select aria-label={'Role for ' + fullName(m)} className="tm-full" value={m.role} disabled={busy} onChange={(e) => go(setTeamRole(team.id, m.id, e.target.value))}>
                    <option value="admin">Admin</option><option value="moderator">Moderator</option><option value="member">Member</option>
                  </Select>
                </div>
              ) : null}
              {staff && m.role === 'member' && roles.length ? (
                <div className="tm-lbl">Custom role
                  <Select aria-label={'Custom role for ' + fullName(m)} className="tm-full" value={cr[m.id] ? cr[m.id].id : ''} disabled={busy} onChange={(e) => go(assignTeamRole(team.id, m.id, e.target.value || null))}>
                    <option value="">No role</option>
                    {roles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
              ) : null}
              {staff ? <button type="button" className="tm-act" disabled={busy} onClick={() => { setSel(null); run(badge(m)); }}><Award size={18} /> Badge</button> : null}
              {owner && !me ? <button type="button" className="tm-act" disabled={busy} onClick={async () => { setSel(null); if (await ask('Make ' + fullName(m) + ' the owner? You become an admin.')) run(transferTeamOwner(team.id, m.id)); }}><Crown size={18} /> Transfer ownership</button> : null}
              {act ? <button type="button" className="tm-act" disabled={busy} onClick={() => { setSel(null); run(muteWith(m, !m.muted)); }}>{m.muted ? <Volume2 size={18} /> : <VolumeX size={18} />} {m.muted ? 'Unmute' : 'Mute'}</button> : null}
              {act ? <button type="button" className="tm-act danger" disabled={busy} onClick={async () => { setSel(null); if (await ask('Remove ' + fullName(m) + ' from the team?')) run(kickMember(team.id, m.id)); }}><UserMinus size={18} /> Remove from team</button> : null}
              {act ? <button type="button" className="tm-act danger" disabled={busy} onClick={async () => { setSel(null); if (await ask('Ban ' + fullName(m) + '? They cannot rejoin until unbanned.')) run(banMember(team.id, m.id)); }}><Ban size={18} /> Ban</button> : null}
            </div>
          </Sheet>
        );
      })() : null}
    </div>
  );
}

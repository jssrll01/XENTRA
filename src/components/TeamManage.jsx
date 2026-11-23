import { ask, promptText } from '../lib/dialog';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, Camera, ChevronRight, Copy, FileText, Hash, History, QrCode, Settings, Shield, Tag, UserPlus } from 'lucide-react';
import Avatar from './ui/Avatar';
import Skeleton from './ui/Skeleton';
import EmptyState from './ui/EmptyState';
import { listChannels, listJoinRequests, listBans, updateTeam, setTeamAvatar, resetTeamInvite, setTeamInviteEnabled, createChannel, updateChannel, archiveChannel, respondJoinRequest, unbanMember } from '../lib/api';
import { uploadAvatar } from '../lib/cloudinary';
import { fullName } from '../lib/format';
import { TeamRules, TeamLog } from './TeamRulesLog';
import TeamCategory from './TeamCategory';
import TeamRoles from './TeamRoles';
import InviteQr from './InviteQr';
import TeamSub, { TeamErr } from './TeamSub';

function Details({ team, busy, run, pick }) {
  const file = useRef(null);
  const [name, setName] = useState(team.name);
  const [desc, setDesc] = useState(team.description || '');
  const [mode, setMode] = useState(team.join_mode);
  const [disc, setDisc] = useState(!!team.discoverable);
  return (
    <>
      <section className="tm-card tm-center">
        <Avatar name={team.name} url={team.avatar_url} size={72} />
        <input ref={file} type="file" accept="image/*" hidden onChange={pick} />
        <button type="button" className="tm-btn" disabled={busy} onClick={() => file.current && file.current.click()}><Camera size={16} /> Change photo</button>
      </section>
      <section className="tm-card">
        <label className="tm-lbl">Name<input className="tm-input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="tm-lbl">Description<textarea className="tm-input" rows={4} maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
        <div className="tm-lbl" id="tm-join">Who can join</div>
        <div className="tm-seg" role="group" aria-labelledby="tm-join">
          <button type="button" aria-pressed={mode === 'open'} onClick={() => setMode('open')}>Open to join</button>
          <button type="button" aria-pressed={mode === 'approval'} onClick={() => setMode('approval')}>Approval required</button>
        </div>
        <button type="button" role="switch" aria-checked={disc} className="tm-sw" onClick={() => setDisc(!disc)}>
          <span className="tm-main"><b>Discoverable</b><span>Show this team in Discover</span></span><i className="tm-track" />
        </button>
      </section>
      <div className="tm-foot"><button type="button" className="tm-btn primary block" disabled={busy || !name.trim()} onClick={() => run(updateTeam(team.id, name, desc, mode, disc), 'Saved', true)}>Save changes</button></div>
    </>
  );
}

function Invite({ team, busy, run, setNote }) {
  const link = team.invite_code ? window.location.origin + '/c/' + team.invite_code : '';
  const on = !!team.invite_enabled && !!link;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setNote('Link copied'); } catch (x) { setNote('Could not copy.'); }
  };
  return (
    <>
      <section className="tm-card tm-center">
        {on ? (
          <>
            <InviteQr link={link} />
            <span className="tm-link">{link}</span>
          </>
        ) : <EmptyState icon={QrCode} title="Invite link is off" text="Turn it on to let people join with a link." />}
      </section>
      <div className="tm-btns">
        {on ? <button type="button" className="tm-btn primary block" onClick={copy}><Copy size={16} /> Copy link</button> : <button type="button" className="tm-btn primary block" disabled={busy} onClick={() => run(setTeamInviteEnabled(team.id, true), '', true)}>Turn on link</button>}
        <button type="button" className="tm-btn block" disabled={busy} onClick={async () => { if (await ask('Make a new link? The old link stops working.')) run(resetTeamInvite(team.id), 'New link ready', true); }}>New link</button>
        {on ? <button type="button" className="tm-btn block" disabled={busy} onClick={() => run(setTeamInviteEnabled(team.id, false), '', true)}>Turn off</button> : null}
      </div>
    </>
  );
}

function Channels({ team, ch, busy, run }) {
  const [cname, setCname] = useState('');
  const rename = async (c) => {
    const n = await promptText('Channel name', c.name);
    if (n && n.trim() && n.trim() !== c.name) run(updateChannel(c.id, n, null));
  };
  const add = async () => { if (await run(createChannel(team.id, cname, false), 'Channel created')) setCname(''); };
  return (
    <>
      <section className="tm-card">
        <h3 className="tm-label">Channels</h3>
        {ch.length === 0 ? <EmptyState icon={Hash} title="No channels yet" text="Add the first channel below." /> : null}
        {ch.map((c) => (
          <div className="tm-chrow" key={c.id}>
            <div className="tm-main"><b>#{c.name}</b>{c.archived ? <span>Archived</span> : null}</div>
            <button type="button" role="switch" aria-checked={!!c.mods_only} className="tm-sw" disabled={busy} onClick={() => run(updateChannel(c.id, null, !c.mods_only))}>
              <span className="tm-main"><b>Moderators only</b><span>Only moderators can post</span></span><i className="tm-track" />
            </button>
            <div className="tm-btnrow">
              <button type="button" className="tm-btn" disabled={busy} onClick={() => rename(c)}>Rename</button>
              <button type="button" className="tm-btn" disabled={busy} onClick={() => run(archiveChannel(c.id, !c.archived))}>{c.archived ? 'Restore' : 'Archive'}</button>
            </div>
          </div>
        ))}
      </section>
      <section className="tm-card">
        <h3 className="tm-label">New channel</h3>
        <div className="tm-add">
          <input className="tm-input" placeholder="Channel name" aria-label="New channel" maxLength={40} value={cname} onChange={(e) => setCname(e.target.value)} />
          <button type="button" className="tm-btn primary" disabled={busy || !cname.trim()} onClick={add}>Add</button>
        </div>
      </section>
    </>
  );
}

function Requests({ req, busy, run }) {
  return (
    <section className="tm-card">
      {req.length === 0 ? <EmptyState icon={UserPlus} title="No requests" text="People asking to join appear here." /> : req.map((q) => (
        <div className="tm-chrow" key={q.id}>
          <div className="tm-row static"><Avatar name={fullName(q.user)} url={q.user.avatar_url} size={40} /><div className="tm-main"><b>{fullName(q.user)}</b><span>@{q.user.username}</span></div></div>
          <div className="tm-btnrow">
            <button type="button" className="tm-btn primary" disabled={busy} onClick={() => run(respondJoinRequest(q.id, true), '', true)}>Accept</button>
            <button type="button" className="tm-btn" disabled={busy} onClick={() => run(respondJoinRequest(q.id, false))}>Decline</button>
          </div>
        </div>
      ))}
    </section>
  );
}

function Bans({ team, bans, busy, run }) {
  return (
    <section className="tm-card">
      {bans.length === 0 ? <EmptyState icon={Ban} title="No banned members" text="Members you ban appear here." /> : bans.map((b) => (
        <div className="tm-row" key={b.id}>
          <Avatar name={fullName(b)} url={b.avatar_url} size={40} />
          <div className="tm-main"><b>{fullName(b)}</b><span>@{b.username}</span></div>
          <button type="button" className="tm-btn" disabled={busy} onClick={() => run(unbanMember(team.id, b.id))}>Unban</button>
        </div>
      ))}
    </section>
  );
}

export default function TeamManage({ team, tick, onChanged }) {
  const [sub, setSub] = useState(null);
  const [ch, setCh] = useState(null);
  const [req, setReq] = useState(null);
  const [bans, setBans] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([listChannels(team.id), listJoinRequests(team.id), listBans(team.id)]);
    const bad = [a, b, c].find((x) => !x.ok);
    if (bad) { setErr(bad.error); return; }
    setCh(a.data || []); setReq(b.data || []); setBans(c.data || []); setErr('');
  }, [team.id]);
  useEffect(() => { load(); }, [load, tick]);
  const run = async (p, msg, reload) => {
    setBusy(true); setNote('');
    const r = await p;
    setBusy(false);
    if (!r.ok) { setErr(r.error); return false; }
    setErr('');
    if (msg) setNote(msg);
    await load();
    if (reload) onChanged();
    return true;
  };
  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    let r = null;
    try { r = await uploadAvatar(f); } catch (x) { r = null; }
    const u = typeof r === 'string' ? r : r && (r.secure_url || r.url || (r.data && (r.data.secure_url || r.data.url || r.data)));
    setBusy(false);
    if (typeof u !== 'string' || !u) { setErr((r && typeof r.error === 'string' && r.error) || 'The upload failed.'); return; }
    run(setTeamAvatar(team.id, u), 'Photo updated', true);
  };
  const open = (k) => { setErr(''); setNote(''); setSub(k); };
  const items = [
    ['details', 'Team details', 'Photo, name, description and join settings', Settings],
    ['invite', 'Invite link', team.invite_enabled ? 'Link is on' : 'Link is off', QrCode],
    ['channels', 'Channels', ch ? ch.length + (ch.length === 1 ? ' channel' : ' channels') : 'Add, rename and archive', Hash],
    ['category', 'Category', 'Shown in Discover', Tag],
    ['roles', 'Custom roles', 'Extra rights for members', Shield],
    ['rules', 'Community rules', 'What people accept before joining', FileText],
    ['log', 'Moderation log', 'Joins, leaves and moderation', History],
    ['requests', 'Join requests', req ? (req.length ? req.length + ' waiting' : 'None waiting') : 'People asking to join', UserPlus, req ? req.length : 0],
    ['bans', 'Banned members', bans ? (bans.length ? bans.length + ' banned' : 'None banned') : 'Unban members', Ban],
  ];
  const alerts = (
    <>
      {err ? <TeamErr msg={err} retry={load} /> : null}
      {note ? <div className="alert info" role="status">{note}</div> : null}
    </>
  );
  if (!sub) {
    return (
      <div className="tm-stack">
        {alerts}
        <section className="tm-card">
          <div className="tm-list">
            {items.map(([k, title, subt, Icon, n]) => (
              <button type="button" className="tm-row" key={k} onClick={() => open(k)}>
                <span className="tm-ic"><Icon size={18} /></span>
                <span className="tm-main"><b>{title}</b><span>{subt}</span></span>
                {n ? <span className="badge">{n}</span> : null}
                <ChevronRight size={18} className="tm-chev" />
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  }
  const wait = !err ? <Skeleton rows={2} /> : null;
  return (
    <TeamSub title={(items.find((i) => i[0] === sub) || [])[1]} onBack={() => { setSub(null); setErr(''); setNote(''); }}>
      {alerts}
      {sub === 'details' ? <Details team={team} busy={busy} run={run} pick={pick} /> : null}
      {sub === 'invite' ? <Invite team={team} busy={busy} run={run} setNote={setNote} /> : null}
      {sub === 'channels' ? (ch ? <Channels team={team} ch={ch} busy={busy} run={run} /> : wait) : null}
      {sub === 'category' ? <TeamCategory team={team} /> : null}
      {sub === 'roles' ? <TeamRoles team={team} tick={tick} /> : null}
      {sub === 'rules' ? <TeamRules team={team} /> : null}
      {sub === 'log' ? <TeamLog team={team} tick={tick} /> : null}
      {sub === 'requests' ? (req ? <Requests req={req} busy={busy} run={run} /> : wait) : null}
      {sub === 'bans' ? (bans ? <Bans team={team} bans={bans} busy={busy} run={run} /> : wait) : null}
    </TeamSub>
  );
}

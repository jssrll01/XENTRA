import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Copy, RefreshCw } from 'lucide-react';
import { listChannels, listJoinRequests, listBans, updateTeam, setTeamAvatar, resetTeamInvite, setTeamInviteEnabled, createChannel, updateChannel, archiveChannel, respondJoinRequest, unbanMember } from '../lib/api';
import { uploadAvatar } from '../lib/cloudinary';
import { fullName } from '../lib/format';
import TeamRulesLog from './TeamRulesLog';
import TeamCategory from './TeamCategory';

export default function TeamManage({ team, tick, onChanged }) {
  const file = useRef(null);
  const [ch, setCh] = useState(null);
  const [req, setReq] = useState(null);
  const [bans, setBans] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(team.name);
  const [desc, setDesc] = useState(team.description || '');
  const [cname, setCname] = useState('');
  const link = team.invite_code ? window.location.origin + '/t/' + team.invite_code : '';
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
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setNote('Link copied'); } catch (x) { setNote('Could not copy.'); }
  };
  const rename = (c) => {
    const n = window.prompt('Channel name', c.name);
    if (n && n.trim() && n.trim() !== c.name) run(updateChannel(c.id, n, null));
  };
  const addCh = async () => { if (await run(createChannel(team.id, cname, false), 'Channel created')) setCname(''); };
  return (
    <>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {note ? <div className="alert info">{note}</div> : null}
      <section className="glass card add-card">
        <h2>Team details</h2>
        <input ref={file} type="file" accept="image/*" hidden onChange={pick} />
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => file.current && file.current.click()}><Camera size={16} /> Change photo</button>
        <input type="text" aria-label="Team name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <input type="text" aria-label="Team description" placeholder="Description" maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} />
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !name.trim()} onClick={() => run(updateTeam(team.id, name, desc, null, null), 'Saved', true)}>Save</button>
        <span className="req-acts">
          <button type="button" className={'chip' + (team.join_mode === 'open' ? ' on' : '')} disabled={busy} onClick={() => run(updateTeam(team.id, null, null, 'open', null), '', true)}>Open to join</button>
          <button type="button" className={'chip' + (team.join_mode === 'approval' ? ' on' : '')} disabled={busy} onClick={() => run(updateTeam(team.id, null, null, 'approval', null), '', true)}>Approval required</button>
          <button type="button" className={'chip' + (team.discoverable ? ' on' : '')} disabled={busy} onClick={() => run(updateTeam(team.id, null, null, null, !team.discoverable), '', true)}>Discoverable</button>
        </span>
      </section>
      <section className="glass card add-card">
        <h2>Invite link</h2>
        <span className="qr-code">{team.invite_enabled ? link : 'Link is off'}</span>
        <span className="req-acts">
          {team.invite_enabled ? <button type="button" className="btn btn-secondary btn-sm" onClick={copy}><Copy size={16} /> Copy</button> : null}
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { if (window.confirm('Make a new link? The old link stops working.')) run(resetTeamInvite(team.id), 'New link ready', true); }}><RefreshCw size={16} /> New link</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(setTeamInviteEnabled(team.id, !team.invite_enabled), '', true)}>{team.invite_enabled ? 'Turn off' : 'Turn on'}</button>
        </span>
      </section>
      <section className="glass card">
        <div className="card-head"><h2>Channels</h2></div>
        {(ch || []).map((c) => (
          <div className="lbl-row" key={c.id}>
            <span>#{c.name}{c.archived ? ' (archived)' : ''}</span>
            <button type="button" className={'chip' + (c.mods_only ? ' on' : '')} disabled={busy} onClick={() => run(updateChannel(c.id, null, !c.mods_only))}>Moderators only</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => rename(c)}>Rename</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(archiveChannel(c.id, !c.archived))}>{c.archived ? 'Restore' : 'Archive'}</button>
          </div>
        ))}
        <div className="lbl-row">
          <input type="text" placeholder="New channel" aria-label="New channel" maxLength={40} value={cname} onChange={(e) => setCname(e.target.value)} />
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || !cname.trim()} onClick={addCh}>Add</button>
        </div>
      </section>
      {req && req.length > 0 ? (
        <section className="glass card">
          <div className="card-head"><h2>Join requests</h2></div>
          {req.map((q) => (
            <div className="lbl-row" key={q.id}>
              <span>{fullName(q.user)} (@{q.user.username})</span>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(respondJoinRequest(q.id, true), '', true)}>Accept</button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(respondJoinRequest(q.id, false))}>Decline</button>
            </div>
          ))}
        </section>
      ) : null}
      <TeamCategory team={team} />
        <TeamRulesLog team={team} tick={tick} />
      {bans && bans.length > 0 ? (
        <section className="glass card">
          <div className="card-head"><h2>Banned</h2></div>
          {bans.map((b) => (
            <div className="lbl-row" key={b.id}>
              <span>{fullName(b)} (@{b.username})</span>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(unbanMember(team.id, b.id))}>Unban</button>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}

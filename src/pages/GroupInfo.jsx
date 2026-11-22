import React, { useCallback, useEffect, useRef, useState } from 'react';
import Skeleton from '../components/ui/Skeleton';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Camera, Copy, Crown, LogOut, RefreshCw, ShieldCheck, ShieldOff, UserMinus, UserPlus } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import PickSheet from '../components/PickSheet';
import { getGroup, listGroupMembers, updateGroup, setGroupAvatar, resetGroupInvite, setGroupInviteEnabled, addGroupMembers, removeGroupMember, leaveGroup, setMemberRole, transferOwnership } from '../lib/api';
import { uploadAvatar } from '../lib/cloudinary';
import { fullName } from '../lib/format';

export default function GroupInfo() {
  const { id } = useParams();
  const nav = useNavigate();
  const file = useRef(null);
  const [g, setG] = useState(null);
  const [mem, setMem] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([getGroup(id), listGroupMembers(id)]);
    if (!a.ok) { setErr(a.error); return; }
    if (!b.ok) { setErr(b.error); return; }
    setG(a.data); setMem(b.data || []); setName(a.data.name || ''); setDesc(a.data.description || ''); setErr('');
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const run = async (p, msg) => {
    setBusy(true); setNote('');
    const r = await p;
    setBusy(false);
    if (r.ok) { if (msg) setNote(msg); await load(); } else setErr(r.error);
  };
  const admin = g && (g.my_role === 'owner' || g.my_role === 'admin');
  const owner = g && g.my_role === 'owner';
  const link = g && g.invite_code ? window.location.origin + '/join/' + g.invite_code : '';
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
    run(setGroupAvatar(id, u), 'Photo updated');
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setNote('Link copied'); } catch (x) { setNote('Could not copy.'); }
  };
  const leave = async () => {
    if (!window.confirm('Leave this group?')) return;
    setBusy(true);
    const r = await leaveGroup(id);
    setBusy(false);
    if (r.ok) nav('/messages'); else setErr(r.error);
  };
  return (
    <>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {note ? <div className="alert info">{note}</div> : null}
      {!g && !err ? <Skeleton /> : null}
      {g ? (
        <>
          <section className="glass card add-card">
            <Avatar name={g.name} url={g.avatar_url} size={80} />
            {admin ? (
              <>
                <input ref={file} type="file" accept="image/*" hidden onChange={pick} />
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => file.current && file.current.click()}><Camera size={16} /> Change photo</button>
                <input type="text" aria-label="Group name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
                <input type="text" aria-label="Group description" placeholder="Description" maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} />
                <button type="button" className="btn btn-primary btn-sm" disabled={busy || !name.trim()} onClick={() => run(updateGroup(id, name, desc, null), 'Saved')}>Save</button>
                <button type="button" className={'chip' + (g.announcement_only ? ' on' : '')} disabled={busy} onClick={() => run(updateGroup(id, null, null, !g.announcement_only))}>Only admins can send</button>
              </>
            ) : (
              <>
                <h2>{g.name}</h2>
                {g.description ? <span>{g.description}</span> : null}
                {g.announcement_only ? <span className="rel-tag">Only admins can send</span> : null}
              </>
            )}
            <span>{g.members} members</span>
            <Link className="see-all" to={'/messages/' + id}>Back to chat</Link>
          </section>
          {admin && g.invite_code ? (
            <section className="glass card add-card">
              <h2>Invite link</h2>
              <span className="qr-code">{g.invite_enabled ? link : 'Link is off'}</span>
              <span className="req-acts">
                {g.invite_enabled ? <button type="button" className="btn btn-secondary btn-sm" onClick={copy}><Copy size={16} /> Copy</button> : null}
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { if (window.confirm('Make a new link? The old link stops working.')) run(resetGroupInvite(id), 'New link ready'); }}><RefreshCw size={16} /> New link</button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(setGroupInviteEnabled(id, !g.invite_enabled))}>{g.invite_enabled ? 'Turn off' : 'Turn on'}</button>
              </span>
            </section>
          ) : null}
          <section className="glass card">
            <div className="card-head"><h2>Members</h2>
              {admin ? <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdd(true)}><UserPlus size={16} /> Add</button> : null}
            </div>
            <div className="rows">
              {(mem || []).map((m) => {
                const mine = m.id === g.me;
                const canRm = !mine && (owner || (g.my_role === 'admin' && m.role === 'member'));
                return (
                  <div className="row static" key={m.id}>
                    <Avatar name={fullName(m)} url={m.avatar_url} size={44} />
                    <div className="row-main"><b>{fullName(m)}{mine ? ' (you)' : ''}</b><span>@{m.username}</span></div>
                    {m.role !== 'member' ? <span className="rel-tag">{m.role}</span> : null}
                    <span className="req-acts">
                      {owner && !mine ? <button type="button" className="icon-btn" aria-label={m.role === 'admin' ? 'Remove admin' : 'Make admin'} disabled={busy} onClick={() => run(setMemberRole(id, m.id, m.role === 'admin' ? 'member' : 'admin'))}>{m.role === 'admin' ? <ShieldOff size={18} /> : <ShieldCheck size={18} />}</button> : null}
                      {owner && !mine ? <button type="button" className="icon-btn" aria-label="Transfer ownership" disabled={busy} onClick={() => { if (window.confirm('Make ' + fullName(m) + ' the owner? You become an admin.')) run(transferOwnership(id, m.id), 'Ownership transferred'); }}><Crown size={18} /></button> : null}
                      {canRm ? <button type="button" className="icon-btn" aria-label={'Remove ' + fullName(m)} disabled={busy} onClick={() => { if (window.confirm('Remove ' + fullName(m) + ' from the group?')) run(removeGroupMember(id, m.id)); }}><UserMinus size={18} /></button> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
          <button type="button" className="btn btn-secondary btn-block" disabled={busy} onClick={leave}><LogOut size={16} /> Leave group</button>
        </>
      ) : null}
      {add && mem ? <PickSheet title="Add members" label="Add" exclude={mem.map((m) => m.id)} onSubmit={(ids) => addGroupMembers(id, ids)} onClose={() => setAdd(false)} onDone={() => { setAdd(false); setNote('Members added'); load(); }} /> : null}
    </>
  );
}

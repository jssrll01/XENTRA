import React, { useCallback, useEffect, useState } from 'react';
import { Megaphone, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import Skeleton from './ui/Skeleton';
import EmptyState from './ui/EmptyState';
import Sheet from './Sheet';
import { TeamErr } from './TeamSub';
import { ask } from '../lib/dialog';
import { listOrgAnnouncements, postOrgAnnouncement, pinOrgAnnouncement, deleteOrgAnnouncement } from '../lib/api';
import { timeAgo } from '../lib/format';

const iso = (v) => (v ? new Date(v).toISOString() : null);

export default function OrgAnnounce({ org, tick }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', body: '', pinned: false, at: '', exp: '' });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await listOrgAnnouncements(org.id);
    if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
  }, [org.id]);
  useEffect(() => { load(); }, [load, tick]);
  const post = async () => {
    setBusy(true); setNote('');
    const r = await postOrgAnnouncement(org.id, f.title, f.body, f.pinned, iso(f.at), iso(f.exp));
    setBusy(false);
    if (!r.ok) { setNote(r.error); return; }
    setOpen(false); setF({ title: '', body: '', pinned: false, at: '', exp: '' }); load();
  };
  const act = async (pr) => {
    setBusy(true);
    const r = await pr;
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    load();
  };
  const del = async (a) => { if (await ask('Delete this announcement?', 'Delete')) act(deleteOrgAnnouncement(a.id)); };
  return (
    <>
      <button type="button" className="tm-btn primary block" onClick={() => { setNote(''); setOpen(true); }}><Plus size={16} /> New announcement</button>
      {err ? <TeamErr msg={err} retry={load} /> : null}
      {!rows && !err ? <Skeleton /> : null}
      {rows && rows.length === 0 ? <EmptyState icon={Megaphone} title="No announcements" text="Post an update for everyone in the organization." /> : null}
      {rows && rows.length > 0 ? (
        <section className="tm-card"><div className="tm-list">
          {rows.map((a) => (
            <div className="tm-row static" key={a.id}>
              <div className="tm-main"><b>{a.title}</b><span>{a.state === 'live' ? timeAgo(a.publish_at) : a.state}{a.reads !== null && a.reads !== undefined ? ' - ' + a.reads + ' read' : ''}</span></div>
              <button type="button" className="tm-ib" aria-label={a.pinned ? 'Unpin' : 'Pin'} disabled={busy} onClick={() => act(pinOrgAnnouncement(a.id, !a.pinned))}>{a.pinned ? <PinOff size={18} /> : <Pin size={18} />}</button>
              <button type="button" className="tm-ib" aria-label="Delete" disabled={busy} onClick={() => del(a)}><Trash2 size={18} /></button>
            </div>
          ))}
        </div></section>
      ) : null}
      {open ? (
        <Sheet title="New announcement" onClose={() => setOpen(false)}>
          <div className="tm-sheet">
            {note ? <div className="alert err">{note}</div> : null}
            <label className="tm-lbl">Title<input className="tm-input" maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
            <label className="tm-lbl">Message<textarea className="tm-input" rows={5} maxLength={4000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
            <label className="tm-lbl">Publish at (empty = now)<input className="tm-input" type="datetime-local" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} /></label>
            <label className="tm-lbl">Expires at (optional)<input className="tm-input" type="datetime-local" value={f.exp} onChange={(e) => setF({ ...f, exp: e.target.value })} /></label>
            <label className="org-check"><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /> Pin to the top</label>
            <button type="button" className="tm-btn primary block" disabled={busy || !f.title.trim() || !f.body.trim()} onClick={post}>Post</button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

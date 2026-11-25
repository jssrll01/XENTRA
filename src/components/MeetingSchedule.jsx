import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import Sheet from './Sheet';
import Button from './ui/Button';
import Field from './ui/Field';
import Skeleton from './ui/Skeleton';
import EmptyState from './ui/EmptyState';
import { ask } from '../lib/dialog';
import { useCall, scheduleList, scheduleSave, scheduleCancel, meetingFor, startMeeting, joinMeeting } from '../lib/call';

const localVal = (iso) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const fmt = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function Panel({ cid, name, onClose }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [f, setF] = useState(null);
  const [fe, setFe] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setErr('');
    const r = await scheduleList(cid);
    if (r.ok) setD(r.data); else setErr(r.error || 'Could not load meetings.');
  }, [cid]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setFe('');
    const t = new Date(f.at);
    if (!f.at || Number.isNaN(t.getTime())) { setFe('Pick a date and time.'); return; }
    setBusy(true);
    const r = await scheduleSave(f.id, cid, f.title, t.toISOString());
    setBusy(false);
    if (!r.ok) { setFe(r.error || 'Could not save.'); return; }
    setF(null);
    load();
  };
  const cancel = async (s) => {
    const yes = await ask('Cancel "' + s.title + '"?', 'Cancel meeting');
    if (!yes) return;
    const r = await scheduleCancel(s.id);
    if (!r.ok) setErr(r.error || 'Could not cancel.');
    else load();
  };
  const go = async (s) => {
    onClose();
    const r = await meetingFor(cid);
    if (r.ok && r.data && r.data.id) joinMeeting(r.data.id, r.data.title || s.title, r.data.mode);
    else startMeeting(cid, s.title);
  };

  if (f) {
    return (
      <div className="sc-form">
        <Field label="Title" value={f.title} maxLength={80} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Field label="Starts" type="datetime-local" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} error={fe} />
        <p className="sc-note">Times use your device time zone. Members get a reminder {''}shortly before the start.</p>
        <div className="sc-actions">
          <Button variant="secondary" onClick={() => setF(null)}>Back</Button>
          <Button loading={busy} onClick={save}>{f.id ? 'Save changes' : 'Schedule'}</Button>
        </div>
      </div>
    );
  }
  return (
    <div>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}>Retry</button></div> : null}
      {!d && !err ? <Skeleton rows={2} /> : null}
      {d && d.items.length === 0 ? <EmptyState icon={CalendarClock} title="No scheduled meetings" text="Schedule one and members get a reminder before it starts." /> : null}
      {d ? d.items.map((s) => {
        const soon = new Date(s.starts_at).getTime() - Date.now() <= 15 * 60000;
        return (
          <div className="sc-row" key={s.id}>
            <div className="sc-main"><b>{s.title}</b><span>{fmt(s.starts_at)}</span></div>
            <div className="sc-btns">
              {soon ? <Button onClick={() => go(s)}>{d.live ? 'Join' : 'Start'}</Button> : null}
              {s.mine ? <Button variant="secondary" onClick={() => setF({ id: s.id, title: s.title, at: localVal(s.starts_at) })}>Edit</Button> : null}
              {s.mine ? <Button variant="secondary" onClick={() => cancel(s)}>Cancel</Button> : null}
            </div>
          </div>
        );
      }) : null}
      {d ? <Button block onClick={() => setF({ id: null, title: name || '', at: '' })}>Schedule a meeting</Button> : null}
    </div>
  );
}

export default function MeetingSchedule({ cid, name }) {
  const c = useCall();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="icon-btn" aria-label="Scheduled meetings" disabled={c.phase !== 'IDLE'} onClick={() => setOpen(true)}><CalendarClock size={20} /></button>
      {open ? <Sheet title="Scheduled meetings" onClose={() => setOpen(false)}><Panel cid={cid} name={name} onClose={() => setOpen(false)} /></Sheet> : null}
    </>
  );
}

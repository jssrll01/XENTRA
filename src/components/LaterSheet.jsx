import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import Sheet from './Sheet';
import { cancelReminder, cancelScheduled, createReminder, listReminders, listScheduled, scheduleMessage, updateScheduledTime } from '../lib/api';
import { clock, dayLabel } from '../lib/chatTime';

const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const soon = () => { const d = new Date(Date.now() + 3600000); d.setMinutes(0, 0, 0); return local(d); };
const stamp = (iso) => dayLabel(iso) + ' ' + clock(iso);

export default function LaterSheet({ conversationId, tab: first = 'schedule', text = '', message = null, onClose, onDone }) {
  const [tab, setTab] = useState(first);
  const [body, setBody] = useState(text);
  const [note, setNote] = useState(message ? message.body.slice(0, 120) : '');
  const [at, setAt] = useState(soon());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sched, setSched] = useState([]);
  const [rems, setRems] = useState([]);
  const [editId, setEditId] = useState(null);
  const [editAt, setEditAt] = useState('');
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([listScheduled(conversationId), listReminders()]);
    if (a.ok) setSched(a.data || []); else setErr(a.error);
    if (b.ok) setRems((b.data || []).filter((x) => x.conversation_id === conversationId)); else setErr(b.error);
  }, [conversationId]);
  useEffect(() => { load(); }, [load]);
  const submit = async () => {
    const t = new Date(at);
    if (Number.isNaN(t.getTime())) { setErr('Choose a date and time.'); return; }
    setBusy(true); setErr('');
    const r = tab === 'schedule'
      ? await scheduleMessage(conversationId, body, t.toISOString())
      : await createReminder(note, t.toISOString(), conversationId, message ? message.id : null);
    setBusy(false);
    if (r.ok) onDone(tab); else setErr(r.error);
  };
  const drop = async (fn, id) => { const r = await fn(id); if (r.ok) load(); else setErr(r.error); };
  const saveEdit = async () => {
    const t = new Date(editAt);
    if (Number.isNaN(t.getTime())) { setErr('Choose a date and time.'); return; }
    setBusy(true); setErr('');
    const r = await updateScheduledTime(editId, t.toISOString());
    setBusy(false);
    if (r.ok) { setEditId(null); load(); } else setErr(r.error);
  };
  const empty = tab === 'schedule' ? !body.trim() : !note.trim();
  return (
    <Sheet title="Later" onClose={onClose}>
      <div className="seg">
        <button type="button" className={tab === 'schedule' ? 'on' : ''} onClick={() => setTab('schedule')}>Schedule message</button>
        <button type="button" className={tab === 'remind' ? 'on' : ''} onClick={() => setTab('remind')}>Remind me</button>
      </div>
      {tab === 'schedule' ? (
        <>
          <label className="lbl" htmlFor="lt-body">Message</label>
          <textarea id="lt-body" rows={3} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
        </>
      ) : (
        <>
          <label className="lbl" htmlFor="lt-note">Reminder</label>
          <input id="lt-note" type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </>
      )}
      <label className="lbl" htmlFor="lt-at">When</label>
      <input id="lt-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
      {err ? <div className="alert err">{err}</div> : null}
      <button type="button" className="btn btn-primary btn-block" disabled={busy || empty} onClick={submit}>
        {busy ? 'Saving...' : tab === 'schedule' ? 'Schedule' : 'Set reminder'}
      </button>
      {sched.length ? <h3 className="sub-h">Scheduled in this chat</h3> : null}
      {sched.map((s) => (
        <div className="q-row" key={s.id}>
          <div className="row-main"><b>{s.body}</b><span>{stamp(s.send_at)}</span></div>
          <button type="button" className="icon-btn" aria-label="Edit send time" onClick={() => { setEditId(editId === s.id ? null : s.id); setEditAt(local(new Date(s.send_at))); }}><Pencil size={18} /></button>
          <button type="button" className="icon-btn" aria-label="Cancel scheduled message" onClick={() => drop(cancelScheduled, s.id)}><X size={18} /></button>
        </div>
      ))}
      {editId ? (
        <div className="q-edit">
          <label className="lbl" htmlFor="lt-edit">New send time</label>
          <input id="lt-edit" type="datetime-local" value={editAt} onChange={(e) => setEditAt(e.target.value)} />
          <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={saveEdit}>{busy ? 'Saving...' : 'Save time'}</button>
        </div>
      ) : null}
      {rems.length ? <h3 className="sub-h">Reminders in this chat</h3> : null}
      {rems.map((s) => (
        <div className="q-row" key={s.id}>
          <div className="row-main"><b>{s.note}</b><span>{stamp(s.remind_at)}</span></div>
          <button type="button" className="icon-btn" aria-label="Cancel reminder" onClick={() => drop(cancelReminder, s.id)}><X size={18} /></button>
        </div>
      ))}
    </Sheet>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import Sheet from './Sheet';
import Skeleton from './ui/Skeleton';
import { listEvents, addEvent, updateEvent, deleteEvent } from '../lib/api';

const pad = (n) => String(n).padStart(2, '0');
const local = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
const key = (d) => d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();

export default function CalendarWidget() {
  const [m, setM] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [evs, setEvs] = useState(null);
  const [next, setNext] = useState([]);
  const [err, setErr] = useState('');
  const [ed, setEd] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const a = new Date(m.getFullYear(), m.getMonth(), 1);
    const b = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    const now = new Date();
    const [x, y] = await Promise.all([listEvents(a.toISOString(), b.toISOString()), listEvents(now.toISOString(), new Date(now.getTime() + 365 * 86400000).toISOString())]);
    if (!x.ok || !y.ok) { setErr(x.ok ? y.error : x.error); return; }
    setEvs(x.data || []); setNext((y.data || []).slice(0, 3)); setErr('');
  }, [m]);
  useEffect(() => { load(); }, [load]);
  const marks = new Set((evs || []).map((e) => key(new Date(e.starts_at))));
  const today = key(new Date());
  const lead = m.getDay();
  const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: lead }, () => null).concat(Array.from({ length: days }, (_, i) => new Date(m.getFullYear(), m.getMonth(), i + 1)));
  const openNew = (d) => { const s = new Date(d || new Date()); if (d) s.setHours(9, 0, 0, 0); setEd({ id: null, title: '', starts: local(s), ends: '', note: '' }); };
  const openOld = (e) => setEd({ id: e.id, title: e.title, starts: local(new Date(e.starts_at)), ends: e.ends_at ? local(new Date(e.ends_at)) : '', note: e.note || '' });
  const save = async () => {
    setBusy(true);
    const s = new Date(ed.starts).toISOString();
    const n = ed.ends ? new Date(ed.ends).toISOString() : null;
    const r = ed.id ? await updateEvent(ed.id, ed.title, s, n, ed.note) : await addEvent(ed.title, s, n, ed.note);
    setBusy(false);
    if (!r.ok) { setEd({ ...ed, err: r.error }); return; }
    setEd(null); load();
  };
  const del = async () => {
    setBusy(true);
    const r = await deleteEvent(ed.id);
    setBusy(false);
    if (!r.ok) { setEd({ ...ed, err: r.error }); return; }
    setEd(null); load();
  };
  const set = (k) => (e) => setEd({ ...ed, [k]: e.target.value });
  return (
    <section className="glass card">
      <div className="card-head"><h2><span className="sec-ic"><CalendarDays size={18} /></span>Calendar</h2><button type="button" className="btn btn-secondary btn-sm" onClick={() => openNew(null)}>Add event</button></div>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      <div className="cal-nav">
        <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
        <b>{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(m)}</b>
        <button type="button" className="icon-btn" aria-label="Next month" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
      </div>
      {!evs && !err ? <Skeleton rows={2} /> : (
        <div className="cal-grid" role="grid">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span className="cal-h" key={'h' + i}>{d}</span>)}
          {cells.map((d, i) => (d
            ? <button type="button" key={i} className={'cal-d' + (key(d) === today ? ' today' : '')} aria-label={d.toDateString() + (marks.has(key(d)) ? ', has events' : '')} onClick={() => openNew(d)}>{d.getDate()}{marks.has(key(d)) ? <i /> : null}</button>
            : <span key={i} />))}
        </div>
      )}
      <b className="cal-up">Next events</b>
      {next.length === 0 && evs ? <p className="note">No upcoming events.</p> : null}
      <div className="rows">
        {next.map((e) => (
          <button type="button" className="row" key={e.id} onClick={() => openOld(e)}>
            <div className="row-main"><b>{e.title}</b><span>{new Date(e.starts_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
          </button>
        ))}
      </div>
      {ed ? (
        <Sheet title={ed.id ? 'Edit event' : 'New event'} onClose={() => { if (!busy) setEd(null); }}>
          {ed.err ? <div className="alert err" role="alert">{ed.err}</div> : null}
          <input type="text" placeholder="Title" aria-label="Title" maxLength={100} value={ed.title} onChange={set('title')} />
          <label className="sx-lbl">Starts<input type="datetime-local" value={ed.starts} onChange={set('starts')} /></label>
          <label className="sx-lbl">Ends (optional)<input type="datetime-local" value={ed.ends} onChange={set('ends')} /></label>
          <textarea placeholder="Note (optional)" aria-label="Note" maxLength={500} value={ed.note} onChange={set('note')} />
          <button type="button" className="btn btn-primary btn-block" disabled={busy || !ed.title.trim() || !ed.starts} onClick={save}>Save</button>
          {ed.id ? <button type="button" className="btn btn-danger btn-block" disabled={busy} onClick={del}>Delete</button> : null}
        </Sheet>
      ) : null}
    </section>
  );
}

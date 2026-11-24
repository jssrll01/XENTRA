import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NotebookPen, Plus, RefreshCw, Trash2 } from 'lucide-react';
import Sheet from './Sheet';
import Skeleton from './ui/Skeleton';
import EmptyState from './ui/EmptyState';
import { listNotes, getNote, addNote, updateNote, deleteNote } from '../lib/api';

function Editor({ id, onClose }) {
  const [n, setN] = useState(null);
  const [st, setSt] = useState('');
  const [err, setErr] = useState('');
  const dirty = useRef(false);
  useEffect(() => { getNote(id).then((r) => { if (r.ok) setN({ title: r.data.title, body: r.data.body }); else setErr(r.error); }); }, [id]);
  useEffect(() => {
    if (!n || !dirty.current) return undefined;
    setSt('Saving...');
    const t = setTimeout(async () => {
      const r = await updateNote(id, n.title, n.body);
      if (r.ok) { setSt('Saved'); setErr(''); dirty.current = false; } else { setSt(''); setErr(r.error); }
    }, 800);
    return () => clearTimeout(t);
  }, [n, id]);
  const set = (k) => (e) => { dirty.current = true; setN({ ...n, [k]: e.target.value }); };
  const del = async () => {
    if (!window.confirm('Delete this note?')) return;
    const r = await deleteNote(id);
    if (r.ok) onClose(); else setErr(r.error);
  };
  return (
    <Sheet title="Note" onClose={onClose}>
      {err ? <div className="alert err" role="alert">{err}</div> : null}
      {!n && !err ? <Skeleton rows={2} /> : null}
      {n ? (
        <>
          <input type="text" placeholder="Title" aria-label="Note title" maxLength={100} value={n.title} onChange={set('title')} />
          <textarea className="wd-body" placeholder="Write something" aria-label="Note body" maxLength={5000} value={n.body} onChange={set('body')} />
          <p className="note" role="status">{st || ' '}</p>
          <button type="button" className="btn btn-danger btn-block" onClick={del}><Trash2 size={16} /> Delete note</button>
        </>
      ) : null}
    </Sheet>
  );
}

export default function NotesWidget() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState('');
  const load = useCallback(async () => {
    const r = await listNotes();
    if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  const create = async () => {
    const r = await addNote('', '');
    if (r.ok) setOpen(r.data.id); else setErr(r.error);
  };
  return (
    <section className="glass card">
      <div className="card-head"><h2><span className="sec-ic"><NotebookPen size={18} /></span>Notes</h2><button type="button" className="btn btn-secondary btn-sm" onClick={create}><Plus size={16} /> New</button></div>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {!rows && !err ? <Skeleton rows={2} /> : null}
      {rows && rows.length === 0 ? <EmptyState icon={NotebookPen} title="No notes yet" text="Tap New to write one." /> : null}
      <div className="rows">
        {(rows || []).slice(0, 5).map((x) => (
          <button type="button" className="row" key={x.id} onClick={() => setOpen(x.id)}>
            <div className="row-main"><b>{x.title || 'Untitled'}</b><span>{x.preview || 'Empty note'}</span></div>
          </button>
        ))}
      </div>
      {open ? <Editor id={open} onClose={() => { setOpen(''); load(); }} /> : null}
    </section>
  );
}

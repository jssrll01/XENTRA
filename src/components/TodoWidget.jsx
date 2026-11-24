import React, { useCallback, useEffect, useState } from 'react';
import { Check, ListChecks, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import Skeleton from './ui/Skeleton';
import EmptyState from './ui/EmptyState';
import { listTodos, addTodo, updateTodo, deleteTodo } from '../lib/api';

export default function TodoWidget() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [ed, setEd] = useState(null);
  const load = useCallback(async () => {
    const r = await listTodos();
    if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  const run = async (p) => {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (r.ok) { load(); return true; }
    setErr(r.error);
    return false;
  };
  const add = async () => { if (await run(addTodo(text, due ? new Date(due + 'T23:59:00').toISOString() : null))) { setText(''); setDue(''); } };
  const dayVal = (iso) => { if (!iso) return ''; const d = new Date(iso); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const edit = (t) => setEd({ id: t.id, text: t.text, due: dayVal(t.due_at), had: Boolean(t.due_at) });
  const save = async () => {
    if (!ed.text.trim()) return;
    const p = { text: ed.text };
    if (ed.due) p.due = new Date(ed.due + 'T23:59:00').toISOString();
    else if (ed.had) p.clearDue = true;
    if (await run(updateTodo(ed.id, p))) setEd(null);
  };
  const open = rows ? rows.filter((t) => !t.done).length : 0;
  return (
    <section className="glass card">
      <div className="card-head"><h2><span className="sec-ic"><ListChecks size={18} /></span>To-do</h2>{rows ? <span className="rel-tag">{open} open</span> : null}</div>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      <div className="lbl-row">
        <input type="text" placeholder="Add a to-do" aria-label="Add a to-do" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) add(); }} />
        <input type="date" aria-label="Due date (optional)" value={due} onChange={(e) => setDue(e.target.value)} />
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !text.trim()} onClick={add}><Plus size={16} /> Add</button>
      </div>
      {!rows && !err ? <Skeleton rows={2} /> : null}
      {rows && rows.length === 0 ? <EmptyState icon={ListChecks} title="Nothing to do" text="Add your first to-do above." /> : null}
      {rows && rows.length > 0 ? (
        <div className="rows">
          {rows.map((t) => (
            <div className="row static" key={t.id}>
              {ed && ed.id === t.id ? (
                <>
                  <input type="text" aria-label="To-do text" maxLength={200} value={ed.text} onChange={(e) => setEd({ ...ed, text: e.target.value })} />
                  <input type="date" aria-label="Due date" value={ed.due} onChange={(e) => setEd({ ...ed, due: e.target.value })} />
                  {ed.due ? <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setEd({ ...ed, due: '' })}>Clear date</button> : null}
                  <button type="button" className="icon-btn" aria-label="Save to-do" disabled={busy || !ed.text.trim()} onClick={save}><Check size={18} /></button>
                  <button type="button" className="icon-btn" aria-label="Cancel edit" disabled={busy} onClick={() => setEd(null)}><X size={18} /></button>
                </>
              ) : (
              <>
              <input type="checkbox" aria-label={'Mark done: ' + t.text} checked={t.done} disabled={busy} onChange={(e) => run(updateTodo(t.id, { done: e.target.checked }))} />
              <div className="row-main"><b className={t.done ? 'wd-done' : ''}>{t.text}</b>{t.due_at ? <span>Due {new Date(t.due_at).toLocaleDateString()}</span> : null}</div>
              <button type="button" className="icon-btn" aria-label="Edit to-do" disabled={busy} onClick={() => edit(t)}><Pencil size={18} /></button>
              <button type="button" className="icon-btn" aria-label="Delete to-do" disabled={busy} onClick={() => run(deleteTodo(t.id))}><Trash2 size={18} /></button>
              </>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

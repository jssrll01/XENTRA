import React, { useCallback, useEffect, useState } from 'react';
import { ListChecks, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import Skeleton from './ui/Skeleton';
import EmptyState from './ui/EmptyState';
import { listTodos, addTodo, updateTodo, deleteTodo } from '../lib/api';

export default function TodoWidget() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
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
  const edit = (t) => { const v = window.prompt('Edit to-do', t.text); if (v && v.trim() && v.trim() !== t.text) run(updateTodo(t.id, { text: v })); };
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
              <input type="checkbox" aria-label={'Mark done: ' + t.text} checked={t.done} disabled={busy} onChange={(e) => run(updateTodo(t.id, { done: e.target.checked }))} />
              <div className="row-main"><b className={t.done ? 'wd-done' : ''}>{t.text}</b>{t.due_at ? <span>Due {new Date(t.due_at).toLocaleDateString()}</span> : null}</div>
              <button type="button" className="icon-btn" aria-label="Edit to-do" disabled={busy} onClick={() => edit(t)}><Pencil size={18} /></button>
              <button type="button" className="icon-btn" aria-label="Delete to-do" disabled={busy} onClick={() => run(deleteTodo(t.id))}><Trash2 size={18} /></button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

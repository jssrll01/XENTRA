import React, { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import Sheet from './Sheet';
import Avatar from './ui/Avatar';
import { listContacts } from '../lib/api';
import { fullName } from '../lib/format';

export default function PickSheet({ title, exclude, withName, label, onSubmit, onClose, onDone }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await listContacts();
    if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  const t = q.trim().toLowerCase();
  const list = (rows || []).filter((c) => !(exclude || []).includes(c.id) && (!t || (fullName(c) + ' ' + (c.username || '')).toLowerCase().includes(t)));
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const submit = async () => {
    setBusy(true);
    const r = await onSubmit(sel, name, desc);
    setBusy(false);
    if (r.ok) onDone(r); else setErr(r.error);
  };
  return (
    <Sheet title={title} onClose={onClose}>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {withName ? (
        <>
          <input type="text" placeholder="Group name" aria-label="Group name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          <input type="text" placeholder="Description (optional)" aria-label="Group description" maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </>
      ) : null}
      <input type="text" placeholder="Search contacts" aria-label="Search contacts" value={q} onChange={(e) => setQ(e.target.value)} />
      {!rows && !err ? <div className="empty pulse">Loading...</div> : null}
      {rows && list.length === 0 ? <p className="note">No contacts to show.</p> : null}
      {list.map((c) => (
        <button type="button" key={c.id} className={'row pick' + (sel.includes(c.id) ? ' on' : '')} onClick={() => toggle(c.id)}>
          <Avatar name={fullName(c)} url={c.avatar_url} size={40} />
          <div className="row-main"><b>{fullName(c)}</b><span>@{c.username}</span></div>
          {sel.includes(c.id) ? <Check size={18} /> : null}
        </button>
      ))}
      <button type="button" className="btn btn-primary btn-block" disabled={busy || sel.length < 1 || (withName && !name.trim())} onClick={submit}>{label} ({sel.length})</button>
    </Sheet>
  );
}

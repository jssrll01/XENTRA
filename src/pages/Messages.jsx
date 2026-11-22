import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Plus, RefreshCw, Search as SearchIcon, X } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';
import ConvRow from '../components/ConvRow';
import { listConversations, startDirect } from '../lib/api';
import { searchPeople } from '../lib/search';
import { useProfile } from '../lib/profile';
import { useSummary } from '../lib/summary';
import { fullName } from '../lib/format';

export default function Messages() {
  const nav = useNavigate();
  const { profile } = useProfile();
  const { tick } = useSummary();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const [serr, setSerr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await listConversations();
    if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
  }, []);
  useEffect(() => { load(); }, [load, tick]);
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    const t = setTimeout(async () => {
      const r = await searchPeople(q, profile.id);
      if (!live) return;
      if (r.ok) { setFound(r.data); setSerr(''); } else setSerr(r.error);
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, open, profile.id]);

  const start = async (p) => {
    setBusy(true);
    const r = await startDirect(p.id);
    setBusy(false);
    if (r.ok) nav('/messages/' + r.data.id); else setSerr(r.error);
  };
  const searching = q.trim().length >= 2;

  return (
    <>
      <div className="page-head">
        <h2>Messages</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(!open)}>{open ? <X size={16} /> : <Plus size={16} />} {open ? 'Close' : 'New'}</button>
      </div>
      {open ? (
        <section className="glass card">
          <label className="chat-find"><SearchIcon size={18} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" /></label>
          {serr ? <div className="alert err">{serr}</div> : null}
          {searching && found && found.length === 0 && !serr ? <div className="empty"><p>No people found.</p></div> : null}
          {searching && found && found.length > 0 ? (
            <div className="rows">
              {found.map((p) => (
                <button type="button" className="row" key={p.id} disabled={busy} onClick={() => start(p)}>
                  <Avatar name={fullName(p)} url={p.avatar_url} size={42} />
                  <div className="row-main"><b>{fullName(p)}</b><span>@{p.username}</span></div>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {!rows && !err ? <div className="empty"><p>Loading...</p></div> : null}
      {rows && rows.length === 0 ? <EmptyState icon={MessageCircle} title="No conversations yet" text="Tap New to message someone." /> : null}
      {rows && rows.length > 0 ? <section className="glass card"><div className="rows">{rows.map((c) => <ConvRow key={c.id} c={c} meId={profile.id} />)}</div></section> : null}
    </>
  );
}

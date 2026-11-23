import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, RefreshCw, Search as SearchIcon } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { listAiDirectory } from '../lib/api';

export default function AiTools() {
  const [cats, setCats] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const load = useCallback(async () => {
    const r = await listAiDirectory();
    if (r.ok) { setCats(r.data || []); setErr(''); } else setErr(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (cats || [])
      .map((c) => ({ ...c, tools: c.tools.filter((x) => !t || (x.name + ' ' + x.company + ' ' + x.tagline).toLowerCase().includes(t)) }))
      .filter((c) => c.tools.length > 0);
  }, [cats, q]);
  return (
    <>
      <div className="page-head"><h2>AI tools</h2></div>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {!cats && !err ? <Skeleton /> : null}
      {cats ? <label className="chat-find"><SearchIcon size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search AI tools" aria-label="Search AI tools" /></label> : null}
      {cats && shown.length === 0 ? <EmptyState icon={SearchIcon} title="No matches" text="Try a different search." /> : null}
      {shown.map((c) => (
        <section className="glass card" key={c.slug}>
          <div className="card-head"><h2>{c.name}</h2></div>
          <div className="rows">
            {c.tools.map((x) => (
              <Link className="row" key={x.slug} to={'/ai/' + x.slug}>
                <Avatar name={x.name} url={null} size={40} />
                <div className="row-main"><b>{x.name}</b><span>{x.tagline}</span></div>
                <ChevronRight size={18} />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

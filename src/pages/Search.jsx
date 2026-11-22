import React, { useEffect, useState } from 'react';
import { Search as SearchIcon, Users } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';
import { useAuth } from '../lib/auth';
import { searchPeople } from '../lib/search';
import { fullName } from '../lib/format';

const nm = (p) => fullName(p) || p.username || 'Member';

export default function Search() {
  const { user } = useAuth();
  const uid = user && user.id;
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setRows(null); setErr(''); setBusy(false); return undefined; }
    let live = true;
    setBusy(true);
    const id = setTimeout(async () => {
      const r = await searchPeople(t, uid);
      if (!live) return;
      setBusy(false);
      if (r.ok) { setRows(r.data); setErr(''); } else setErr(r.error);
    }, 250);
    return () => { live = false; clearTimeout(id); };
  }, [q, uid]);

  return (
    <>
      <div className="field">
        <span className="field-icon"><SearchIcon size={20} /></span>
        <label className="field-body">
          <span className="field-label">Search</span>
          <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or username" autoComplete="off" />
        </label>
      </div>
      {err ? <div className="alert err">{err}</div> : null}
      <section className="glass card">
        <div className="card-head"><h2>People</h2></div>
        {rows === null && busy ? <div className="empty pulse">Searching...</div>
          : rows === null ? <EmptyState icon={SearchIcon} title="Search XENTRA" text="Type at least 2 characters to find people." />
          : rows.length === 0 ? <EmptyState icon={Users} title="No matches" text="Try a different name or username." />
          : (
            <div className="rows">
              {rows.map((p) => (
                <div className="row static" key={p.id}>
                  <Avatar name={nm(p)} url={p.avatar_url} size={44} />
                  <div className="row-main"><b>{nm(p)}</b><span>{p.username ? '@' + p.username : ''}</span></div>
                </div>
              ))}
            </div>
          )}
      </section>
    </>
  );
}

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Clock, MessageCircle, Search as SearchIcon, UserPlus, Users } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import { useAuth } from '../lib/auth';
import { searchPeople } from '../lib/search';
import { startDirect, contactRelations, sendContactRequest } from '../lib/api';
import { fullName } from '../lib/format';

const nm = (p) => fullName(p) || p.username || 'Member';

export default function Search() {
  const { user } = useAuth();
  const uid = user && user.id;
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const [starting, setStarting] = useState('');
  const [rel, setRel] = useState({});
  const [adding, setAdding] = useState('');
  const add = async (p) => {
    setAdding(p.id);
    const r = await sendContactRequest(p.id);
    setAdding('');
    if (r.ok) setRel((x) => ({ ...x, [p.id]: r.data.status === 'accepted' ? 'contact' : 'outgoing' })); else setErr(r.error);
  };
  const message = async (p) => {
    setStarting(p.id);
    const r = await startDirect(p.id);
    setStarting('');
    if (r.ok) nav('/messages/' + r.data.id); else setErr(r.error);
  };

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setRows(null); setErr(''); setBusy(false); return undefined; }
    let live = true;
    setBusy(true);
    const id = setTimeout(async () => {
      const r = await searchPeople(t, uid);
      if (!live) return;
      setBusy(false);
      if (r.ok) {
        setRows(r.data); setErr('');
        contactRelations(r.data.map((p) => p.id)).then((x) => { if (live && x.ok) setRel(x.data || {}); });
      } else setErr(r.error);
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
        {rows === null && busy ? <Skeleton rows={3} />
          : rows === null ? <EmptyState icon={SearchIcon} title="Search XENTRA" text="Type at least 2 characters to find people." />
          : rows.length === 0 ? <EmptyState icon={Users} title="No matches" text="Try a different name or username." />
          : (
            <div className="rows">
              {rows.map((p) => (
                <div className="row static" key={p.id}>
                  <Avatar name={nm(p)} url={p.avatar_url} size={44} />
                  <div className="row-main"><b>{nm(p)}</b><span>{p.username ? '@' + p.username : ''}</span></div>
                  {rel[p.id] === 'contact' ? <span className="rel-tag"><Check size={14} /> Contact</span>
                    : rel[p.id] === 'outgoing' ? <span className="rel-tag"><Clock size={14} /> Requested</span>
                    : rel[p.id] === 'incoming' ? <button type="button" className="icon-btn" aria-label={'Accept ' + nm(p)} title="Accept request" disabled={adding === p.id} onClick={() => add(p)}><UserPlus size={20} /></button>
                    : rel[p.id] === 'blocked' ? <span className="rel-tag">Blocked</span>
                    : <button type="button" className="icon-btn" aria-label={'Add ' + nm(p) + ' as contact'} title="Add contact" disabled={adding === p.id} onClick={() => add(p)}><UserPlus size={20} /></button>}
                  <button type="button" className="icon-btn" aria-label={'Message ' + nm(p)} title="Message" disabled={starting === p.id} onClick={() => message(p)}><MessageCircle size={20} /></button>
                </div>
              ))}
            </div>
          )}
      </section>
    </>
  );
}

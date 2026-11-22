import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Search as SearchIcon, User as UserIcon } from 'lucide-react';
import Avatar from './ui/Avatar';
import { NAV } from '../nav';
import { searchPeople } from '../lib/search';
import { listMyTeams, startDirect } from '../lib/api';
import { fullName } from '../lib/format';

const PAGES = NAV.concat([{ to: '/notifications', label: 'Activity' }, { to: '/settings', label: 'Settings' }, { to: '/search', label: 'Search' }]);

export default function CommandPalette({ onClose, uid }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [teams, setTeams] = useState([]);
  const [people, setPeople] = useState([]);
  const [err, setErr] = useState('');
  useEffect(() => { listMyTeams().then((r) => { if (r.ok) setTeams(r.data || []); else setErr(r.error); }); }, []);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setPeople([]); return undefined; }
    let live = true;
    const id = setTimeout(async () => {
      const r = await searchPeople(t, uid);
      if (!live) return;
      if (r.ok) { setPeople((r.data || []).slice(0, 6)); setErr(''); } else setErr(r.error);
    }, 250);
    return () => { live = false; clearTimeout(id); };
  }, [q, uid]);
  const s = q.trim().toLowerCase();
  const pages = PAGES.filter((p) => !s || p.label.toLowerCase().indexOf(s) >= 0);
  const tms = teams.filter((t) => !s || t.name.toLowerCase().indexOf(s) >= 0).slice(0, 5);
  const go = (to) => { onClose(); nav(to); };
  const chat = async (p) => {
    const r = await startDirect(p.id);
    if (r.ok) go('/messages/' + r.data.id); else setErr(r.error);
  };
  return (
    <div className="pal-bg" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pal glass" role="dialog" aria-modal="true" aria-label="Command palette">
        <label className="pal-in"><SearchIcon size={18} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, teams, pages" aria-label="Search" autoComplete="off" /></label>
        {err ? <div className="alert err">{err}</div> : null}
        <div className="rows">
          {people.map((p) => (
            <button type="button" className="row" key={p.id} onClick={() => chat(p)}>
              <Avatar name={fullName(p)} url={p.avatar_url} size={36} />
              <div className="row-main"><b>{fullName(p)}</b><span>Message @{p.username}</span></div>
            </button>
          ))}
          {tms.map((t) => (
            <button type="button" className="row" key={t.id} onClick={() => go('/teams/' + t.id)}>
              <Layers size={18} /><div className="row-main"><b>{t.name}</b><span>Team</span></div>
            </button>
          ))}
          {pages.map((p) => (
            <button type="button" className="row" key={p.to} onClick={() => go(p.to)}>
              <UserIcon size={18} /><div className="row-main"><b>{p.label}</b><span>Go to page</span></div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

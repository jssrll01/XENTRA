import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Search, Settings, User } from 'lucide-react';
import Logo from './Logo';
import Avatar from './ui/Avatar';
import { NAV } from '../nav';
import { useAuth } from '../lib/auth';
import { useProfile } from '../lib/profile';
import { useSummary } from '../lib/summary';
import { fullName } from '../lib/format';
import { pingPresence, getMyPresence } from '../lib/api';
import CommandPalette from './CommandPalette';

const EXTRA = { '/notifications': 'Activity', '/search': 'Search', '/settings': 'Settings' };

export default function AppShell() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { signOut } = useAuth();
  const { profile } = useProfile();
  const { summary } = useSummary();
  const [menu, setMenu] = useState(false);
  const [pal, setPal] = useState(false);
  const um = Number(summary && summary.unread && summary.unread.value) || 0;
  const ref = useRef(null);
  const [pres, setPres] = useState({ status: 'online', status_text: null });
  const title = (NAV.find((n) => pathname.startsWith(n.to)) || {}).label || EXTRA[pathname] || 'XENTRA';
  const unread = (summary && summary.notifications) || 0;
  const name = fullName(profile);
  const plabel = pres.status === 'dnd' ? 'Do not disturb' : pres.status === 'invisible' ? 'Invisible' : 'Online';

  useEffect(() => {
    const load = () => { getMyPresence().then((r) => { if (r.ok) setPres(r.data); }); };
    const ping = () => { if (document.visibilityState === 'visible') pingPresence(); };
    load(); ping();
    const t = setInterval(ping, 60000);
    window.addEventListener('xentra-presence', load);
    document.addEventListener('visibilitychange', ping);
    return () => { clearInterval(t); window.removeEventListener('xentra-presence', load); document.removeEventListener('visibilitychange', ping); };
  }, []);
  useEffect(() => { setMenu(false); }, [pathname]);
  useEffect(() => {
    const k = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPal(true); } };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [nav]);
  useEffect(() => {
    if (!menu) return undefined;
    const off = (e) => { if (ref.current && !ref.current.contains(e.target)) setMenu(false); };
    const key = (e) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('pointerdown', off);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', key); };
  }, [menu]);

  return (
    <div className="app">
      {pal ? <CommandPalette uid={profile.id} onClose={() => setPal(false)} /> : null}
      <aside className="side" aria-label="Sidebar">
        <Logo size={40} />
        <button type="button" className="side-search" onClick={() => setPal(true)}><Search size={18} /><span>Search people</span><kbd>Ctrl K</kbd></button>
        <nav className="side-nav" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}><Icon size={20} />{label}{to === '/messages' && um > 0 ? <span className="nav-badge">{um > 99 ? '99+' : um}</span> : null}</NavLink>
          ))}
        </nav>
        <div className="side-user">
          <Avatar name={name} url={profile.avatar_url} size={42} presence={pres.status === 'online' ? 'online' : undefined} />
          <div className="who"><b>{name}</b><span className="status"><i />{pres.status_text || plabel}</span></div>
          <button type="button" className="icon-btn" aria-label="Settings" onClick={() => nav('/settings')}><Settings size={18} /></button>
        </div>
      </aside>

      <div className="app-col">
        <header className="topbar">
          <div className="brand-mobile"><Logo size={36} /></div>
          <h1 className="page-title">{title}</h1>
          <span className="spacer" />
          <button type="button" className="search-pill" aria-label="Search" onClick={() => setPal(true)}><Search size={18} /><span>Search people</span><kbd>Ctrl K</kbd></button>
          <button type="button" className="icon-btn" aria-label={unread ? 'Notifications, ' + unread + ' unread' : 'Notifications'} onClick={() => nav('/notifications')}>
            <Bell size={20} />
            {unread > 0 ? <span className="count">{unread > 99 ? '99+' : unread}</span> : null}
          </button>
          <div className="menu-wrap" ref={ref}>
            <button type="button" className="avatar-btn" aria-haspopup="menu" aria-expanded={menu} aria-label="Account menu" onClick={() => setMenu(!menu)}>
              <Avatar name={name} url={profile.avatar_url} size={42} presence={pres.status === 'online' ? 'online' : undefined} /><ChevronDown size={16} />
            </button>
            {menu ? (
              <div className="pop glass" role="menu">
                <div className="pop-head"><b>{name}</b><span>{profile.email}</span></div>
                <button type="button" role="menuitem" onClick={() => nav('/profile')}><User size={18} /> Profile</button>
                <button type="button" role="menuitem" onClick={() => nav('/settings')}><Settings size={18} /> Settings</button>
                <button type="button" role="menuitem" onClick={signOut}><LogOut size={18} /> Sign out</button>
              </div>
            ) : null}
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>

      <nav className="bottom-nav" aria-label="Primary">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => 'bn-item' + (isActive ? ' active' : '')}><Icon size={24} />{label}{to === '/messages' && um > 0 ? <span className="nav-badge">{um > 99 ? '99+' : um}</span> : null}</NavLink>
        ))}
      </nav>
    </div>
  );
}

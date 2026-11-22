import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Search, User } from 'lucide-react';
import Logo from './Logo';
import Avatar from './ui/Avatar';
import { NAV } from '../nav';
import { useAuth } from '../lib/auth';
import { useProfile } from '../lib/profile';
import { useSummary } from '../lib/summary';
import { fullName } from '../lib/format';

const EXTRA = { '/notifications': 'Activity', '/search': 'Search' };

export default function AppShell() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { signOut } = useAuth();
  const { profile } = useProfile();
  const { summary } = useSummary();
  const [menu, setMenu] = useState(false);
  const ref = useRef(null);
  const title = (NAV.find((n) => pathname.startsWith(n.to)) || {}).label || EXTRA[pathname] || 'XENTRA';
  const unread = (summary && summary.notifications) || 0;
  const name = fullName(profile);

  useEffect(() => { setMenu(false); }, [pathname]);
  useEffect(() => {
    const k = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); nav('/search'); } };
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
      <aside className="side" aria-label="Sidebar">
        <Logo size={38} tagline={false} />
        <nav className="side-nav" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}><Icon size={20} />{label}</NavLink>
          ))}
        </nav>
        <div className="side-user">
          <Avatar name={name} url={profile.avatar_url} size={40} />
          <div><b>{name}</b><span>{profile.username ? '@' + profile.username : profile.email}</span></div>
        </div>
      </aside>

      <div className="app-col">
        <header className="topbar">
          <div className="brand-mobile"><Logo size={34} tagline={false} /></div>
          <h1 className="page-title">{title}</h1>
          <span className="spacer" />
          <button type="button" className="search-pill" aria-label="Search" onClick={() => nav('/search')}><Search size={18} /><span>Search people</span><kbd>Ctrl K</kbd></button>
          <button type="button" className="icon-btn" aria-label={unread ? 'Notifications, ' + unread + ' unread' : 'Notifications'} onClick={() => nav('/notifications')}>
            <Bell size={20} />
            {unread > 0 ? <span className="count">{unread > 99 ? '99+' : unread}</span> : null}
          </button>
          <div className="menu-wrap" ref={ref}>
            <button type="button" className="avatar-btn" aria-haspopup="menu" aria-expanded={menu} aria-label="Account menu" onClick={() => setMenu(!menu)}>
              <Avatar name={name} url={profile.avatar_url} size={40} /><ChevronDown size={16} />
            </button>
            {menu ? (
              <div className="pop glass" role="menu">
                <div className="pop-head"><b>{name}</b><span>{profile.email}</span></div>
                <button type="button" role="menuitem" onClick={() => nav('/profile')}><User size={18} /> Profile</button>
                <button type="button" role="menuitem" onClick={signOut}><LogOut size={18} /> Sign out</button>
              </div>
            ) : null}
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>

      <nav className="bottom-nav" aria-label="Primary">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => 'bn-item' + (isActive ? ' active' : '')}><Icon size={22} />{label}</NavLink>
        ))}
      </nav>
    </div>
  );
}

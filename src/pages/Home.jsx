import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageCircle, Users, MailPlus, CalendarClock, RefreshCw, Search, Bell, ArrowRight, Layers, Megaphone, Sparkles, ChevronRight, ListChecks, CalendarDays, NotebookPen } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import Avatar from '../components/ui/Avatar';
import Skeleton from '../components/ui/Skeleton';
import { useProfile } from '../lib/profile';
import { useSummary } from '../lib/summary';
import { listNotifications, getAnnouncement, listMyTeams } from '../lib/api';
import { greeting, ago } from '../lib/format';
import RecentChats from '../components/RecentChats';
import ClockWidget from '../components/ClockWidget';

const TILES = [
  ['unread', 'Unread messages', MessageCircle, 'blue'],
  ['active', 'Active conversations', Users, 'violet'],
  ['invites', 'Pending invitations', MailPlus, 'amber'],
  ['scheduled', 'Scheduled and reminders', CalendarClock, 'green'],
];

const PLANNER = [
  ['/todo', 'To-do', 'Tasks you need to finish', ListChecks],
  ['/calendar', 'Calendar', 'Events and dates', CalendarDays],
  ['/notes', 'Notes', 'Your personal notes', NotebookPen],
];

const HOLD_MS = 300;

function useHold(go) {
  const timer = useRef(null);
  const start = useRef(null);
  const [active, setActive] = useState('');
  const stop = () => { clearTimeout(timer.current); timer.current = null; setActive(''); };
  useEffect(() => () => clearTimeout(timer.current), []);
  const bind = (to) => ({
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY };
      setActive(to);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { timer.current = null; setActive(''); go(to); }, HOLD_MS);
    },
    onPointerMove: (e) => {
      if (timer.current && start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) stop();
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onContextMenu: (e) => e.preventDefault(),
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(to); } },
  });
  return { bind, active };
}

const today = () => new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export default function Home() {
  const { profile } = useProfile();
  const nav = useNavigate();
  const { bind, active } = useHold(nav);
  const { summary, state, reload, tick } = useSummary();
  const [recent, setRecent] = useState(null);
  const [rerr, setRerr] = useState('');
  const [ann, setAnn] = useState(null);
  const [teams, setTeams] = useState(null);
  const [herr, setHerr] = useState('');
  const [hk, setHk] = useState(0);
  const count = summary ? summary.notifications : null;

  useEffect(() => {
    let live = true;
    listNotifications(5).then((r) => {
      if (!live) return;
      if (r.ok) { setRecent(r.data || []); setRerr(''); } else setRerr(r.error);
    });
    return () => { live = false; };
  }, [count]);

  useEffect(() => {
    let live = true;
    Promise.all([getAnnouncement(), listMyTeams()]).then(([a, t]) => {
      if (!live) return;
      if (!a.ok || !t.ok) { setHerr(a.ok ? t.error : a.error); return; }
      setAnn(a.data); setTeams(t.data || []); setHerr('');
    });
    return () => { live = false; };
  }, [tick, hk]);

  return (
    <div className="hm">
      <header className="hm-head">
        <h1>{greeting()}, <span>{profile.first_name || 'there'}</span>.</h1>
        <p>{today()}</p>
      </header>

      <Link to="/search" className="search-bar"><Search size={20} /><span>Search people</span></Link>

      {state === 'error' || state === 'notready' ? (
        <div className="alert err with-action"><span>Could not load your summary.</span><button type="button" className="btn btn-secondary btn-sm" onClick={reload}><RefreshCw size={16} /> Retry</button></div>
      ) : null}

      {ann ? (
        <section className="glass ann" aria-label="Announcement">
          <span className="sec-ic"><Megaphone size={18} /></span>
          <div className="row-main"><b>{ann.title}</b>{ann.body ? <span>{ann.body}</span> : null}</div>
        </section>
      ) : null}

      <section className="glass hm-stats" aria-label="Summary">
        {TILES.map(([key, label, Icon, tone]) => {
          const t = summary && summary[key];
          return (
            <div className="hm-stat" key={key}>
              <span className={'tile-ic tone-' + tone}><Icon size={22} /></span>
              <div>
                {t ? <div className="tile-n">{t.value}</div> : <span className="sk sk-tile-n" />}
                <div className="tile-l">{label}</div>
              </div>
            </div>
          );
        })}
      </section>

      <ClockWidget />

      <section className="glass card" aria-label="Planner">
        <div className="card-head"><h2><span className="sec-ic"><ListChecks size={18} /></span>Planner</h2></div>
        <p className="tm-hint">Press and hold a row to open it.</p>
        <div className="rows">
          {PLANNER.map(([to, label, hint, Icon]) => (
            <button type="button" className={'row hm-hold' + (active === to ? ' on' : '')} key={to} {...bind(to)}>
              <span className="sec-ic"><Icon size={18} /></span>
              <div className="row-main"><b>{label}</b><span>{hint}</span></div>
              <ChevronRight size={18} className="hm-go" />
            </button>
          ))}
        </div>
      </section>

      <RecentChats />

      <section className="glass card">
        <div className="card-head"><h2><span className="sec-ic"><Layers size={18} /></span>My Teams</h2><Link className="see-all" to="/teams">See all <ArrowRight size={16} /></Link></div>
        {herr ? <div className="alert err with-action"><span>{herr}</span><button type="button" className="btn btn-secondary btn-sm" onClick={() => setHk(hk + 1)}><RefreshCw size={16} /> Retry</button></div> : null}
        {!teams && !herr ? <Skeleton rows={2} /> : null}
        {teams && teams.length === 0 ? <EmptyState icon={Layers} title="No teams yet" text="Create or join a team to see it here." /> : null}
        {teams && teams.length > 0 ? (
          <div className="rows">
            {teams.slice(0, 5).map((t) => (
              <Link className="row" key={t.id} to={'/teams/' + t.id}>
                <Avatar name={t.name} url={t.avatar_url} size={40} />
                <div className="row-main"><b>{t.name}</b><span>{t.members} members</span></div>
                <ChevronRight size={18} className="hm-go" />
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      <section className="glass card">
        <div className="card-head"><h2><span className="sec-ic"><Bell size={18} /></span>Recent Activity</h2><Link className="see-all" to="/notifications">See all <ArrowRight size={16} /></Link></div>
        {rerr ? <div className="alert err">{rerr}</div> : null}
        {!recent && !rerr ? <Skeleton rows={2} /> : null}
        {recent && recent.length === 0 ? <EmptyState icon={Bell} title="No activity yet" text="Invitations, mentions and updates will appear here." /> : null}
        {recent && recent.length > 0 ? (
          <div className="rows">
            {recent.map((n) => (
              <Link className="row" key={n.id} to="/notifications">
                <span className={n.read_at ? 'dot off' : 'dot'} />
                <div className="row-main"><b>{n.title}</b>{n.body ? <span>{n.body}</span> : null}</div>
                <span className="row-time">{ago(n.created_at)}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      <Link to="/ai" className="glass card ai-link">
        <span className="sec-ic"><Sparkles size={18} /></span>
        <div className="row-main"><b>Explore AI tools</b><span>Discover and compare popular AI platforms</span></div>
        <ChevronRight size={20} className="ai-link-go" />
      </Link>
    </div>
  );
}

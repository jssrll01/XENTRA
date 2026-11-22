import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Users, MailPlus, CalendarClock, RefreshCw, Search, Bell, ArrowRight, Layers, Megaphone } from 'lucide-react';
import { BrandArt } from '../components/Logo';
import Sparkline from '../components/ui/Sparkline';
import EmptyState from '../components/ui/EmptyState';
import { useProfile } from '../lib/profile';
import { useSummary } from '../lib/summary';
import { listNotifications, getAnnouncement, listMyTeams } from '../lib/api';
import Avatar from '../components/ui/Avatar';
import Skeleton from '../components/ui/Skeleton';
import { greeting, ago } from '../lib/format';
import RecentChats from '../components/RecentChats';

const TILES = [
  ['unread', 'Unread Messages', MessageCircle, '#3b82f6', 'blue'],
  ['active', 'Active Conversations', Users, '#8b5cf6', 'violet'],
  ['invites', 'Pending Invitations', MailPlus, '#f59e0b', 'amber'],
  ['scheduled', 'Scheduled & Reminders', CalendarClock, '#10b981', 'green'],
];

export default function Home() {
  const { profile } = useProfile();
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
    <>
      <section className="glass hero">
        <h1>{greeting()}, <span>{profile.first_name || 'there'}</span>.</h1>
        <p>Your workspace, all in one place.</p>
        <div className="hero-art"><BrandArt size={170} /></div>
      </section>

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

      <section className="tiles" aria-label="Summary">
        {TILES.map(([key, label, Icon, color, tone]) => {
          const t = summary && summary[key];
          return (
            <div className="glass tile" key={key}>
              <span className={'tile-ic tone-' + tone}><Icon size={22} /></span>
              {t ? <div className="tile-n">{t.value}</div> : <span className="sk sk-tile-n" />}
              <div className="tile-l">{label}</div>
              <Sparkline series={(t && t.series) || []} color={color} />
            </div>
          );
        })}
      </section>

      <RecentChats />

      <section className="glass card">
        <div className="card-head"><h2><span className="sec-ic"><Layers size={18} /></span>My Teams</h2><Link className="see-all" to="/teams">See all <ArrowRight size={16} /></Link></div>
        {herr ? <div className="alert err with-action"><span>{herr}</span><button type="button" className="btn btn-secondary btn-sm" onClick={() => setHk(hk + 1)}><RefreshCw size={16} /> Retry</button></div> : null}
        {!teams && !herr ? <Skeleton rows={2} /> : null}
        {teams && teams.length === 0 ? <EmptyState icon={Layers} title="No teams yet" text="Create or join a team to see it here." /> : null}
        {teams && teams.length > 0 ? (
          <div className="team-strip">
            {teams.map((t) => (
              <Link className="team-card" key={t.id} to={'/teams/' + t.id}>
                <Avatar name={t.name} url={t.avatar_url} size={48} />
                <b>{t.name}</b>
                <span>{t.members} members</span>
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
    </>
  );
}

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Users, MailPlus, CalendarClock, RefreshCw, Search, Bell, ArrowRight } from 'lucide-react';
import { BrandArt } from '../components/Logo';
import Sparkline from '../components/ui/Sparkline';
import EmptyState from '../components/ui/EmptyState';
import { useProfile } from '../lib/profile';
import { useSummary } from '../lib/summary';
import { listNotifications } from '../lib/api';
import { greeting } from '../lib/format';
import { ago } from '../lib/time';

const TILES = [
  ['unread', 'Unread Messages', MessageCircle, '#3b82f6', 'blue'],
  ['active', 'Active Conversations', Users, '#8b5cf6', 'violet'],
  ['invites', 'Pending Invitations', MailPlus, '#f59e0b', 'amber'],
  ['scheduled', 'Scheduled & Reminders', CalendarClock, '#10b981', 'green'],
];

export default function Home() {
  const { profile } = useProfile();
  const { summary, state, reload } = useSummary();
  const [recent, setRecent] = useState(null);
  const [rerr, setRerr] = useState('');
  const count = summary ? summary.notifications : null;

  useEffect(() => {
    let live = true;
    listNotifications(5).then((r) => {
      if (!live) return;
      if (r.ok) { setRecent(r.data || []); setRerr(''); } else setRerr(r.error);
    });
    return () => { live = false; };
  }, [count]);

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

      <section className="tiles" aria-label="Summary">
        {TILES.map(([key, label, Icon, color, tone]) => {
          const t = summary && summary[key];
          return (
            <div className="glass tile" key={key}>
              <span className={'tile-ic tone-' + tone}><Icon size={22} /></span>
              <div className="tile-n">{t ? t.value : '-'}</div>
              <div className="tile-l">{label}</div>
              <Sparkline series={(t && t.series) || []} color={color} />
            </div>
          );
        })}
      </section>

      <section className="glass card">
        <div className="card-head"><h2><span className="sec-ic"><Bell size={18} /></span>Recent Activity</h2><Link className="see-all" to="/notifications">See all <ArrowRight size={16} /></Link></div>
        {rerr ? <div className="alert err">{rerr}</div> : null}
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

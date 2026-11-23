import React, { useCallback, useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import Skeleton from './ui/Skeleton';
import EmptyState from './ui/EmptyState';
import { TeamErr } from './TeamSub';
import { listTeamActivity } from '../lib/api';
import { timeAgo } from '../lib/format';

function dayLabel(iso) {
  const d = new Date(iso);
  const t = new Date();
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], d.getFullYear() === t.getFullYear() ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' });
}

function group(rows) {
  const out = [];
  rows.forEach((a) => {
    const l = dayLabel(a.created_at);
    const last = out[out.length - 1];
    if (last && last.l === l) last.items.push(a); else out.push({ l, items: [a] });
  });
  return out;
}

export default function TeamActivity({ team, tick }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const r = await listTeamActivity(team.id);
    if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
  }, [team.id]);
  useEffect(() => { load(); }, [load, tick]);
  return (
    <div className="tm-stack">
      {err ? <TeamErr msg={err} retry={load} /> : null}
      {!rows && !err ? <Skeleton rows={4} /> : null}
      {rows && rows.length === 0 ? <section className="tm-card"><EmptyState icon={Activity} title="No activity yet" text="Joins, posts and changes appear here." /></section> : null}
      {rows && rows.length > 0 ? (
        <section className="tm-card">
          {group(rows).map((g) => (
            <div key={g.l}>
              <h3 className="tm-label tm-day">{g.l}</h3>
              <ul className="tm-tl">
                {g.items.map((a) => (
                  <li key={a.id}><b>{a.actor_name}</b><span>{a.text}</span><time>{timeAgo(a.created_at)}</time></li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

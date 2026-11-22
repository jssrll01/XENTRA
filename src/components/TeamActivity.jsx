import React, { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import EmptyState from './ui/EmptyState';
import { listTeamActivity } from '../lib/api';
import { timeAgo } from '../lib/format';

export default function TeamActivity({ team, tick }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const r = await listTeamActivity(team.id);
    if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
  }, [team.id]);
  useEffect(() => { load(); }, [load, tick]);
  return (
    <>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {!rows && !err ? <div className="empty pulse">Loading...</div> : null}
      {rows && rows.length === 0 ? <EmptyState icon={Activity} title="No activity yet" text="Joins, posts and changes appear here." /> : null}
      {rows && rows.length > 0 ? (
        <section className="glass card"><div className="rows">
          {rows.map((a) => (
            <div className="row static" key={a.id}>
              <div className="row-main"><b>{a.actor_name}</b><span>{a.text}</span></div>
              <span className="row-time">{timeAgo(a.created_at)}</span>
            </div>
          ))}
        </div></section>
      ) : null}
    </>
  );
}

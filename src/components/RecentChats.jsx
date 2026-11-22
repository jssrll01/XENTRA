import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MessageCircle, RefreshCw } from 'lucide-react';
import ConvRow from './ConvRow';
import EmptyState from './ui/EmptyState';
import { listConversations } from '../lib/api';
import { useProfile } from '../lib/profile';
import { useSummary } from '../lib/summary';

export default function RecentChats() {
  const { profile } = useProfile();
  const { summary } = useSummary();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const key = summary && summary.unread ? summary.unread.value : null;
  const load = useCallback(async () => {
    const r = await listConversations();
    if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
  }, []);
  useEffect(() => { load(); }, [load, key]);
  return (
    <section className="glass card">
      <div className="card-head"><h2><span className="sec-ic"><MessageCircle size={18} /></span>Recent Conversations</h2><Link className="see-all" to="/messages">See all <ArrowRight size={16} /></Link></div>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {rows && rows.length === 0 ? <EmptyState icon={MessageCircle} title="No conversations yet" text="Start one from Messages." /> : null}
      {rows && rows.length > 0 ? <div className="rows">{rows.slice(0, 4).map((c) => <ConvRow key={c.id} c={c} meId={profile.id} />)}</div> : null}
    </section>
  );
}

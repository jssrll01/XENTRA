import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, RefreshCw } from 'lucide-react';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { callHistory } from '../lib/call';
import { timeAgo } from '../lib/format';

const OUT = { answered: 'Answered', declined: 'Declined', missed: 'No answer', cancelled: 'Cancelled' };
const mmss = (s) => Math.floor(s / 60) + 'm ' + (s % 60) + 's';

export default function CallHistory() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const r = await callHistory(50);
    if (r.ok) { setRows(Array.isArray(r.data) ? r.data : []); setErr(''); } else setErr(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <>
      <div className="page-head"><h2>Call history</h2><Link className="btn btn-secondary btn-sm" to="/messages"><ArrowLeft size={16} /> Messages</Link></div>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {!rows && !err ? <Skeleton rows={4} /> : null}
      {rows && rows.length === 0 ? <EmptyState icon={Phone} title="No calls yet" text="Voice calls you make and receive appear here." /> : null}
      {rows && rows.length > 0 ? (
        <section className="glass card"><div className="rows">
          {rows.map((h) => {
            const Icon = h.outcome === 'missed' && h.direction === 'incoming' ? PhoneMissed : h.direction === 'incoming' ? PhoneIncoming : PhoneOutgoing;
            const sub = [h.direction === 'incoming' ? 'Incoming' : 'Outgoing', OUT[h.outcome] || h.outcome, h.duration_seconds ? mmss(h.duration_seconds) : ''].filter(Boolean).join(' - ');
            return (
              <div className="row static" key={h.id}>
                <span className="tm-ic"><Icon size={18} /></span>
                <div className="row-main"><b>{h.peer_name || h.name || 'Contact'}</b><span>{sub}</span></div>
                {h.created_at ? <span className="row-time">{timeAgo(h.created_at)}</span> : null}
              </div>
            );
          })}
        </div></section>
      ) : null}
    </>
  );
}

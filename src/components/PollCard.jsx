import React, { useEffect, useState } from 'react';
import Skeleton from './ui/Skeleton';
import { pollVoters } from '../lib/api';

const nm = (v) => ((v.first_name || '') + ' ' + (v.last_name || '')).trim() || v.username || 'Member';
const when = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function PollCard({ poll, onVote, onRetract, onClose }) {
  const [expired, setExpired] = useState(() => Boolean(poll.closes_at) && new Date(poll.closes_at).getTime() <= Date.now());
  const [open, setOpen] = useState(false);
  const [voters, setVoters] = useState(null);
  const [verr, setVerr] = useState('');
  const [tick, setTick] = useState(0);
  const closed = poll.closed || expired;
  const total = Math.max(poll.voters, 1);
  const hasMine = poll.options.some((o) => o.mine);
  const sig = poll.options.map((o) => o.count).join(',');

  useEffect(() => {
    if (!poll.closes_at || poll.closed) return undefined;
    const ms = new Date(poll.closes_at).getTime() - Date.now();
    if (ms <= 0 || ms > 2147483000) return undefined;
    const t = setTimeout(() => setExpired(true), ms);
    return () => clearTimeout(t);
  }, [poll.closes_at, poll.closed]);

  useEffect(() => {
    if (!open || poll.anonymous) return undefined;
    let live = true;
    pollVoters(poll.id).then((r) => {
      if (!live) return;
      if (r.ok) { setVoters(r.data || []); setVerr(''); } else setVerr(r.error);
    });
    return () => { live = false; };
  }, [open, poll.id, poll.anonymous, sig, tick]);

  return (
    <div className="pollc">
      {poll.options.map((o) => {
        const pct = Math.round((o.count / total) * 100);
        return (
          <button type="button" key={o.id} className={'pollc-opt' + (o.mine ? ' mine' : '')} disabled={closed} aria-pressed={o.mine} onClick={() => onVote(o.id)}>
            <i style={{ width: pct + '%' }} />
            <span>{o.label}</span><b>{o.count} ({pct}%)</b>
          </button>
        );
      })}
      <div className="pollc-foot">
        <span>
          {poll.voters} {poll.voters === 1 ? 'voter' : 'voters'}
          {poll.multiple ? ' - multiple answers' : ''}
          {poll.anonymous ? ' - anonymous' : ''}
          {closed ? ' - closed' : poll.closes_at ? ' - closes ' + when(poll.closes_at) : ''}
        </span>
      </div>
      <div className="pollc-act">
        {hasMine && !closed ? <button type="button" onClick={onRetract}>Retract vote</button> : null}
        {!poll.anonymous && poll.voters > 0 ? <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? 'Hide voters' : 'Voters'}</button> : null}
        {poll.owner && !closed ? <button type="button" onClick={onClose}>Close poll</button> : null}
      </div>
      {open && !poll.anonymous ? (
        <div className="pollc-voters">
          {verr ? <div className="alert err">{verr} <button type="button" onClick={() => setTick((t) => t + 1)}>Retry</button></div> : null}
          {!verr && voters === null ? <Skeleton rows={2} /> : null}
          {!verr && voters ? poll.options.filter((o) => voters.some((v) => v.option_id === o.id)).map((o) => (
            <div key={o.id}>
              <b>{o.label}</b>
              {voters.filter((v) => v.option_id === o.id).map((v) => <span key={v.user_id}>{nm(v)}</span>)}
            </div>
          )) : null}
        </div>
      ) : null}
    </div>
  );
}

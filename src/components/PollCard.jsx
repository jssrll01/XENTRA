import React from 'react';

export default function PollCard({ poll, onVote, onClose }) {
  const total = Math.max(poll.voters, 1);
  return (
    <div className="pollc">
      {poll.options.map((o) => (
        <button type="button" key={o.id} className={'pollc-opt' + (o.mine ? ' mine' : '')} disabled={poll.closed} aria-pressed={o.mine} onClick={() => onVote(o.id)}>
          <i style={{ width: Math.round((o.count / total) * 100) + '%' }} />
          <span>{o.label}</span><b>{o.count}</b>
        </button>
      ))}
      <div className="pollc-foot">
        <span>{poll.voters} {poll.voters === 1 ? 'voter' : 'voters'}{poll.multiple ? ' - multiple answers' : ''}{poll.closed ? ' - closed' : ''}</span>
        {poll.owner && !poll.closed ? <button type="button" onClick={onClose}>Close poll</button> : null}
      </div>
    </div>
  );
}

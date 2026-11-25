import React from 'react';
import { Shield, UserMinus, X } from 'lucide-react';

export function People({ members, role, uid, onClose, onRole, onAsk }) {
  const can = (m) => m.user_id !== uid && m.role !== 'host' && (role === 'host' || (role === 'moderator' && m.role === 'participant'));
  return (
    <div className="cl-set" role="dialog" aria-label="People">
      <div className="cl-set-head"><b>People ({members.length})</b><button type="button" className="cl-btn sm" aria-label="Close people" onClick={onClose}><X size={18} /></button></div>
      <div className="cl-ppl">
        {members.map((m) => (
          <div className="cl-prow" key={m.user_id}>
            <span className="cl-pn">{m.name}{m.user_id === uid ? ' (you)' : ''}<small>{m.role}</small></span>
            {role === 'host' && can(m) ? <button type="button" className="cl-btn sm" aria-label={m.role === 'moderator' ? 'Remove moderator role' : 'Make moderator'} onClick={() => onRole(m.user_id, m.role === 'moderator' ? 'participant' : 'moderator')}><Shield size={18} /></button> : null}
            {can(m) ? <button type="button" className="cl-btn sm" aria-label={'Remove ' + m.name} onClick={() => onAsk({ kind: 'remove', uid: m.user_id, name: m.name })}><UserMinus size={18} /></button> : null}
          </div>
        ))}
      </div>
      {role === 'host' ? <button type="button" className="cl-end" onClick={() => onAsk({ kind: 'end' })}>End meeting for everyone</button> : null}
    </div>
  );
}

export function Confirm({ a, onNo, onYes }) {
  const T = {
    leave: ['Leave meeting?', 'The meeting continues for the others.', 'Leave'],
    end: ['End meeting for everyone?', 'Everyone is disconnected.', 'End for all'],
    remove: ['Remove ' + (a.name || 'this person') + '?', 'They are disconnected and cannot rejoin.', 'Remove'],
  }[a.kind];
  return (
    <div className="cl-confirm" role="alertdialog" aria-label={T[0]}>
      <div className="cl-confirm-box">
        <b>{T[0]}</b>
        <p>{T[1]}</p>
        <div className="cl-confirm-acts">
          <button type="button" className="cl-cbtn" onClick={onNo}>Cancel</button>
          <button type="button" className="cl-cbtn red" onClick={onYes}>{T[2]}</button>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { Check, Link2, Send, Shield, UserMinus, X } from 'lucide-react';
import { useCall, admitPerson, setLobby, copyLink, revokeLinks, setRole, chatList, chatSend } from '../lib/call';

export const RX = { like: '\u{1F44D}', clap: '\u{1F44F}', heart: '\u2764\uFE0F', laugh: '\u{1F602}', party: '\u{1F389}', wow: '\u{1F62E}' };

export function People({ uid, onClose, onAsk }) {
  const c = useCall();
  const mod = c.role === 'host' || c.role === 'moderator';
  const can = (m) => m.user_id !== uid && m.role !== 'host' && (c.role === 'host' || (c.role === 'moderator' && m.role === 'participant'));
  return (
    <div className="cl-set" role="dialog" aria-label="People">
      <div className="cl-set-head"><b>People ({c.members.length})</b><button type="button" className="cl-btn sm" aria-label="Close people" onClick={onClose}><X size={18} /></button></div>
      {mod && c.wait.length > 0 ? (
        <div className="cl-wait">
          <b>Waiting to join</b>
          {c.wait.map((w) => (
            <div className="cl-prow" key={w.user_id}>
              <span className="cl-pn">{w.name}</span>
              <button type="button" className="cl-btn sm" aria-label={'Admit ' + w.name} onClick={() => admitPerson(w.user_id, true)}><Check size={18} /></button>
              <button type="button" className="cl-btn sm" aria-label={'Deny ' + w.name} onClick={() => admitPerson(w.user_id, false)}><X size={18} /></button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="cl-ppl">
        {c.members.map((m) => (
          <div className="cl-prow" key={m.user_id}>
            <span className="cl-pn">{m.name}{m.user_id === uid ? ' (you)' : ''}<small>{m.role}</small></span>
            {c.role === 'host' && can(m) ? <button type="button" className="cl-btn sm" aria-label={m.role === 'moderator' ? 'Remove moderator role' : 'Make moderator'} onClick={() => setRole(m.user_id, m.role === 'moderator' ? 'participant' : 'moderator')}><Shield size={18} /></button> : null}
            {can(m) ? <button type="button" className="cl-btn sm" aria-label={'Remove ' + m.name} onClick={() => onAsk({ kind: 'remove', uid: m.user_id, name: m.name })}><UserMinus size={18} /></button> : null}
          </div>
        ))}
      </div>
      {mod ? (
        <div className="cl-tools">
          <button type="button" className="cl-cbtn" aria-pressed={c.lobby} onClick={() => setLobby(!c.lobby)}>Lobby: {c.lobby ? 'on' : 'off'}</button>
          <button type="button" className="cl-cbtn" onClick={copyLink}><Link2 size={16} /> Copy invite link</button>
          <button type="button" className="cl-cbtn" onClick={revokeLinks}>Revoke links</button>
        </div>
      ) : null}
      {c.role === 'host' ? <button type="button" className="cl-end" onClick={() => onAsk({ kind: 'end' })}>End meeting for everyone</button> : null}
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

export function Reactions({ onPick }) {
  return (
    <div className="cl-react" role="group" aria-label="Reactions">
      {Object.keys(RX).map((k) => <button key={k} type="button" className="cl-rbtn" aria-label={k} onClick={() => onPick(k)}>{RX[k]}</button>)}
    </div>
  );
}

export function Chat({ uid, onClose }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const after = useRef(null);
  const box = useRef(null);
  useEffect(() => {
    let on = true;
    const pull = async () => {
      const r = await chatList(after.current);
      if (!on || !r.ok || !Array.isArray(r.data) || r.data.length === 0) return;
      after.current = r.data[r.data.length - 1].created_at;
      setMsgs((p) => { const seen = new Set(p.map((m) => m.id)); return p.concat(r.data.filter((m) => !seen.has(m.id))); });
    };
    pull();
    const t = setInterval(pull, 1500);
    return () => { on = false; clearInterval(t); };
  }, []);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs]);
  const send = async (e) => {
    e.preventDefault();
    const b = text.trim();
    if (!b) return;
    setText('');
    const r = await chatSend(b);
    if (r.ok) setErr(''); else { setErr(r.error); setText(b); }
  };
  return (
    <div className="cl-set" role="dialog" aria-label="Meeting chat">
      <div className="cl-set-head"><b>Chat</b><button type="button" className="cl-btn sm" aria-label="Close chat" onClick={onClose}><X size={18} /></button></div>
      <div className="cl-msgs" ref={box}>
        {msgs.length === 0 ? <p>No messages yet.</p> : null}
        {msgs.map((m) => <div key={m.id} className={'cl-msg' + (m.user_id === uid ? ' mine' : '')}><small>{m.user_id === uid ? 'You' : m.name}</small>{m.body}</div>)}
      </div>
      {err ? <p role="alert">{err}</p> : null}
      <form className="cl-chatf" onSubmit={send}>
        <input className="cl-input" maxLength={500} placeholder="Message" aria-label="Message" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="cl-btn sm" aria-label="Send message" disabled={!text.trim()}><Send size={18} /></button>
      </form>
    </div>
  );
}

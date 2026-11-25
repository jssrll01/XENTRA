import React, { useEffect, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
import Avatar from './ui/Avatar';
import { useCall, startCallEvents, acceptCall, declineCall, cancelCall, hangUp, toggleMute } from '../lib/call';

const mmss = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');

export default function CallHost({ uid }) {
  const c = useCall();
  const [now, setNow] = useState(Date.now());
  useEffect(() => startCallEvents(uid), [uid]);
  useEffect(() => {
    if (c.phase !== 'CONNECTED' && c.phase !== 'RECONNECTING') return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [c.phase]);
  useEffect(() => {
    if (c.phase !== 'INCOMING' || !navigator.vibrate) return undefined;
    const t = setInterval(() => navigator.vibrate([400, 300, 400]), 1500);
    navigator.vibrate([400, 300, 400]);
    return () => { clearInterval(t); navigator.vibrate(0); };
  }, [c.phase]);

  const toast = c.notice ? <div className="toast" role="status">{c.notice}</div> : null;
  if (c.phase === 'IDLE') return toast;

  if (c.phase === 'INCOMING') {
    return (
      <div className="cl-back" role="alertdialog" aria-label="Incoming call">
        <div className="cl-card">
          <Avatar name={c.peer} url={c.avatar} size={96} />
          <h2>{c.peer}</h2>
          <p>Incoming voice call</p>
          <div className="cl-row">
            <button type="button" className="cl-btn red" aria-label="Decline call" onClick={declineCall}><PhoneOff size={26} /></button>
            <button type="button" className="cl-btn green" aria-label="Accept call" onClick={acceptCall}><Phone size={26} /></button>
          </div>
        </div>
      </div>
    );
  }

  const secs = c.since ? Math.max(0, Math.floor((now - c.since) / 1000)) : 0;
  const label = { INITIATING: 'Starting call...', RINGING: 'Ringing...', CONNECTING: 'Connecting...', CONNECTED: mmss(secs), RECONNECTING: 'Reconnecting...' }[c.phase];
  const ringing = c.phase === 'RINGING' || c.phase === 'INITIATING';
  return (
    <div className="cl-back full" role="dialog" aria-label="Voice call">
      <div className="cl-card">
        {c.phase === 'RECONNECTING' ? <div className="cl-warn" role="status">Connection is weak. Reconnecting...</div> : null}
        <Avatar name={c.peer} url={c.avatar} size={110} />
        <h2>{c.peer}</h2>
        <p role="timer" aria-live="off">{label}</p>
        <div className="cl-row">
          <button type="button" className={'cl-btn' + (c.muted ? ' on' : '')} aria-label={c.muted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={c.muted} disabled={!c.live} onClick={toggleMute}>{c.muted ? <MicOff size={26} /> : <Mic size={26} />}</button>
          {c.phase === 'INITIATING' ? null : <button type="button" className="cl-btn red" aria-label={ringing ? 'Cancel call' : 'End call'} onClick={ringing ? cancelCall : hangUp}><PhoneOff size={26} /></button>}
        </div>
      </div>
      {toast}
    </div>
  );
}

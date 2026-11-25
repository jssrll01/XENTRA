import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Settings, Signal, SignalHigh, SignalLow, SignalMedium, SignalZero, SwitchCamera, Video, VideoOff, X } from 'lucide-react';
import Avatar from './ui/Avatar';
import Select from './ui/Select';
import { useCall, startCallEvents, acceptCall, declineCall, cancelCall, hangUp, toggleMute, toggleCamera, switchCamera, listDevices, pickDevice } from '../lib/call';

const mmss = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
const Q = { excellent: [SignalHigh, 'Excellent'], good: [SignalMedium, 'Good'], poor: [SignalLow, 'Poor'], lost: [SignalZero, 'Lost'] };

function VideoEl({ track, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!track || !el) return undefined;
    track.attach(el);
    return () => { track.detach(el); };
  }, [track]);
  return <video ref={ref} className={className} autoPlay playsInline muted />;
}

function Quality({ q }) {
  const [Icon, text] = Q[q] || [Signal, 'Checking'];
  return <span className={'cl-q ' + (Q[q] ? q : '')} role="status"><Icon size={14} /> {text}</span>;
}

function DeviceSettings({ video, onClose }) {
  const [d, setD] = useState(null);
  const [sel, setSel] = useState({ audioinput: '', videoinput: '', audiooutput: '' });
  useEffect(() => { let live = true; listDevices().then((x) => { if (live) setD(x); }); return () => { live = false; }; }, []);
  const rows = [['audioinput', 'Microphone'], ['videoinput', 'Camera'], ['audiooutput', 'Speaker']].filter(([k]) => (k !== 'videoinput' || video) && d && d[k].length > 0);
  const change = async (k, v) => { setSel((s) => ({ ...s, [k]: v })); await pickDevice(k, v); };
  return (
    <div className="cl-set" role="dialog" aria-label="Device settings">
      <div className="cl-set-head"><b>Devices</b><button type="button" className="cl-btn sm" aria-label="Close settings" onClick={onClose}><X size={18} /></button></div>
      {!d ? <p>Loading devices...</p> : null}
      {d && rows.length === 0 ? <p>This browser does not list devices.</p> : null}
      {rows.map(([k, l]) => (
        <label key={k} className="cl-lbl">{l}
          <Select aria-label={l} className="cl-sel" value={sel[k]} onChange={(e) => change(k, e.target.value)}>
            <option value="">Default</option>
            {d[k].map((x) => <option key={x.deviceId} value={x.deviceId}>{x.label || l}</option>)}
          </Select>
        </label>
      ))}
    </div>
  );
}

export default function CallHost({ uid }) {
  const c = useCall();
  const [now, setNow] = useState(Date.now());
  const [dev, setDev] = useState(false);
  useEffect(() => startCallEvents(uid), [uid]);
  useEffect(() => { if (c.phase === 'IDLE') setDev(false); }, [c.phase]);
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
  const video = c.mode === 'video';

  if (c.phase === 'INCOMING') {
    return (
      <div className="cl-back" role="alertdialog" aria-label="Incoming call">
        <div className="cl-card">
          <Avatar name={c.peer} url={c.avatar} size={96} />
          <h2>{c.peer}</h2>
          <p>Incoming {video ? 'video' : 'voice'} call</p>
          <div className="cl-row">
            <button type="button" className="cl-btn red" aria-label="Decline call" onClick={declineCall}><PhoneOff size={26} /></button>
            <button type="button" className="cl-btn green" aria-label="Accept call" onClick={acceptCall}>{video ? <Video size={26} /> : <Phone size={26} />}</button>
          </div>
        </div>
      </div>
    );
  }

  const secs = c.since ? Math.max(0, Math.floor((now - c.since) / 1000)) : 0;
  const label = { INITIATING: 'Starting call...', RINGING: 'Ringing...', CONNECTING: 'Connecting...', CONNECTED: mmss(secs), RECONNECTING: 'Reconnecting...' }[c.phase];
  const ringing = c.phase === 'RINGING' || c.phase === 'INITIATING';
  const showRemote = video && c.remoteTrack && !c.remoteOff;
  return (
    <div className="cl-back full" role="dialog" aria-label={video ? 'Video call' : 'Voice call'}>
      {showRemote ? <VideoEl track={c.remoteTrack} className="cl-remote" /> : null}
      {video && c.camOn && c.localTrack ? <VideoEl track={c.localTrack} className={'cl-pip' + (c.facing === 'user' ? ' mirror' : '')} /> : null}
      <div className={'cl-card' + (showRemote ? ' over' : '')}>
        {c.phase === 'RECONNECTING' ? <div className="cl-warn" role="status">Connection is weak. Reconnecting...</div> : null}
        {showRemote ? null : <Avatar name={c.peer} url={c.avatar} size={110} />}
        <h2>{c.peer}</h2>
        <p role="timer" aria-live="off">{label}</p>
        {c.live ? <Quality q={c.quality} /> : null}
        {video && c.remoteOff && c.live ? <p>Camera is off</p> : null}
        <div className="cl-row">
          <button type="button" className={'cl-btn' + (c.muted ? ' on' : '')} aria-label={c.muted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={c.muted} disabled={!c.live} onClick={toggleMute}>{c.muted ? <MicOff size={26} /> : <Mic size={26} />}</button>
          {video ? <button type="button" className={'cl-btn' + (c.camOn ? '' : ' on')} aria-label={c.camOn ? 'Turn camera off' : 'Turn camera on'} aria-pressed={!c.camOn} disabled={!c.live} onClick={toggleCamera}>{c.camOn ? <Video size={26} /> : <VideoOff size={26} />}</button> : null}
          {video && c.camOn ? <button type="button" className="cl-btn" aria-label="Switch camera" onClick={switchCamera}><SwitchCamera size={26} /></button> : null}
          <button type="button" className="cl-btn" aria-label="Device settings" disabled={!c.live} onClick={() => setDev(!dev)}><Settings size={26} /></button>
          {c.phase === 'INITIATING' ? null : <button type="button" className="cl-btn red" aria-label={ringing ? 'Cancel call' : 'End call'} onClick={ringing ? cancelCall : hangUp}><PhoneOff size={26} /></button>}
        </div>
      </div>
      {dev ? <DeviceSettings video={video} onClose={() => setDev(false)} /> : null}
      {toast}
    </div>
  );
}

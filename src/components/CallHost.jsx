import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Settings, Signal, SignalHigh, SignalLow, SignalMedium, SignalZero, SwitchCamera, Users, Video, VideoOff, X, LogOut, Hand, Monitor, MonitorOff, MessageSquare, SmilePlus } from 'lucide-react';
import Avatar from './ui/Avatar';
import Select from './ui/Select';
import { useCall, startCallEvents, acceptCall, declineCall, cancelCall, hangUp, toggleMute, toggleCamera, switchCamera, listDevices, pickDevice, leaveMeeting, endForAll, removePerson, toggleHand, sendReaction, toggleShare } from '../lib/call';
import { People, Confirm, Chat, Reactions, RX } from './MeetingPanels';

const mmss = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
const Q = { excellent: [SignalHigh, 'Excellent'], good: [SignalMedium, 'Good'], poor: [SignalLow, 'Poor'], lost: [SignalZero, 'Lost'] };
const STATUS = { INITIATING: 'Starting', RINGING: 'Ringing', CONNECTING: 'Connecting', CONNECTED: 'Live', RECONNECTING: 'Reconnecting', WAITING: 'Waiting' };

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

function Tile({ p, m, avatar, mirror }) {
  return (
    <div className={'ml-tile' + (p.speaking ? ' sp' : '')}>
      {p.track ? <VideoEl track={p.track} className={'ml-vid' + (p.local && mirror ? ' mirror' : '')} /> : <Avatar name={p.name} url={p.local ? null : avatar} size={72} />}
      {m && m.hand ? <span className="ml-hand" role="img" aria-label="Hand raised"><Hand size={16} /></span> : null}
      {m && m.reaction ? <span className="ml-rx" aria-hidden="true">{RX[m.reaction]}</span> : null}
      <span className="ml-name">{p.micOff ? <MicOff size={14} /> : null}{p.name}</span>
    </div>
  );
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
  const [ppl, setPpl] = useState(false);
  const [ask, setAsk] = useState(null);
  const [chat, setChat] = useState(false);
  const [rx, setRx] = useState(false);
  useEffect(() => startCallEvents(uid), [uid]);
  useEffect(() => { if (c.phase === 'IDLE') { setDev(false); setPpl(false); setAsk(null); setChat(false); setRx(false); } }, [c.phase]);
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
  const doAsk = () => { const a = ask; setAsk(null); if (a.kind === 'leave') leaveMeeting(); else if (a.kind === 'end') endForAll(); else if (a.kind === 'remove') removePerson(a.uid); };

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
  const inCall = c.phase === 'CONNECTED' || c.phase === 'RECONNECTING';
  const grid = inCall && c.parts.length > 0;
  const mm = {};
  c.members.forEach((m) => { mm[m.user_id] = m; });
  const me = mm[uid] || null;
  const sharer = c.parts.find((p) => p.screen) || null;
  const sharing = c.parts.some((p) => p.local && p.screen);
  const canShare = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  const ringing = c.phase === 'RINGING' || c.phase === 'INITIATING';
  const hero = { INITIATING: 'Starting call...', RINGING: 'Ringing...', CONNECTING: 'Connecting...', CONNECTED: mmss(secs), RECONNECTING: 'Reconnecting...', WAITING: 'Waiting for the host to let you in...' }[c.phase];
  return (
    <div className="cl-back full" role="dialog" aria-label={video ? 'Video call' : 'Voice call'}>
      <div className="ml">
        <header className="ml-head">
          <span className="ml-brand">XENTRA</span>
          <div className="ml-title"><b>{c.group ? (c.title || c.peer || 'Meeting') : c.peer ? 'Call with ' + c.peer : 'Call'}</b><span>{STATUS[c.phase]}{grid ? ' - ' + c.parts.length + ' in call' : ''}</span></div>
          <span className="ml-time" role="timer" aria-live="off">{inCall ? mmss(secs) : '--:--'}</span>
        </header>
        {c.phase === 'RECONNECTING' ? <div className="cl-warn ml-warn" role="status">Connection is weak. Reconnecting...</div> : null}
        {grid && sharer ? <div className="ml-share"><VideoEl track={sharer.screen} className="ml-vid fit" /><span className="ml-name">{sharer.local ? 'You are' : sharer.name + ' is'} sharing</span></div> : null}
        {grid ? (
          <div className={'ml-grid' + (sharer ? ' strip' : '')} data-n={Math.min(c.parts.length, 5)}>
            {c.parts.map((p) => <Tile key={p.id} p={p} m={mm[p.id]} avatar={c.avatar} mirror={c.facing === 'user'} />)}
          </div>
        ) : (
          <div className="ml-hero">
            <Avatar name={c.peer} url={c.avatar} size={110} />
            <h2>{c.peer}</h2>
            <p>{hero}</p>
          </div>
        )}
        <div className="ml-bar">
          {c.live ? <Quality q={c.quality} /> : null}
          <div className="cl-row">
            <button type="button" className={'cl-btn' + (c.muted ? ' on' : '')} aria-label={c.muted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={c.muted} disabled={!c.live} onClick={toggleMute}>{c.muted ? <MicOff size={24} /> : <Mic size={24} />}</button>
            {video ? <button type="button" className={'cl-btn' + (c.camOn ? '' : ' on')} aria-label={c.camOn ? 'Turn camera off' : 'Turn camera on'} aria-pressed={!c.camOn} disabled={!c.live} onClick={toggleCamera}>{c.camOn ? <Video size={24} /> : <VideoOff size={24} />}</button> : null}
            {video && c.camOn ? <button type="button" className="cl-btn" aria-label="Switch camera" onClick={switchCamera}><SwitchCamera size={24} /></button> : null}
            {c.live && canShare ? <button type="button" className={'cl-btn' + (sharing ? ' on' : '')} aria-label={sharing ? 'Stop sharing screen' : 'Share screen'} aria-pressed={sharing} onClick={toggleShare}>{sharing ? <MonitorOff size={24} /> : <Monitor size={24} />}</button> : null}
            {c.group && c.live ? <><button type="button" className={'cl-btn' + (me && me.hand ? ' on' : '')} aria-label={me && me.hand ? 'Lower hand' : 'Raise hand'} aria-pressed={!!(me && me.hand)} onClick={() => toggleHand(!(me && me.hand))}><Hand size={24} /></button><button type="button" className="cl-btn" aria-label="Reactions" onClick={() => { setRx(!rx); setChat(false); setPpl(false); setDev(false); }}><SmilePlus size={24} /></button><button type="button" className="cl-btn" aria-label="Chat" onClick={() => { setChat(!chat); setRx(false); setPpl(false); setDev(false); }}><MessageSquare size={24} /></button></> : null}
            {c.group ? <button type="button" className="cl-btn" aria-label="People" disabled={!c.live} onClick={() => { setPpl(!ppl); setDev(false); setChat(false); setRx(false); }}><Users size={24} />{c.wait.length > 0 ? <span className="cl-badge">{c.wait.length}</span> : null}</button> : null}
            <button type="button" className="cl-btn" aria-label="Device settings" disabled={!c.live} onClick={() => { setDev(!dev); setPpl(false); setChat(false); setRx(false); }}><Settings size={24} /></button>
            {c.group ? (c.phase === 'INITIATING' ? null : <button type="button" className="cl-btn red" aria-label="Leave meeting" onClick={() => setAsk({ kind: 'leave' })}><LogOut size={24} /></button>) : c.phase === 'INITIATING' ? null : <button type="button" className="cl-btn red" aria-label={ringing ? 'Cancel call' : 'End call'} onClick={ringing ? cancelCall : hangUp}><PhoneOff size={24} /></button>}
          </div>
        </div>
      </div>
      {dev ? <DeviceSettings video={video} onClose={() => setDev(false)} /> : null}
      {ppl && c.group ? <People uid={uid} onClose={() => setPpl(false)} onAsk={setAsk} /> : null}
      {chat && c.group ? <Chat uid={uid} onClose={() => setChat(false)} /> : null}
      {rx && c.live ? <Reactions onPick={(k) => { sendReaction(k); setRx(false); }} /> : null}
      {ask ? <Confirm a={ask} onNo={() => setAsk(null)} onYes={doAsk} /> : null}
      {toast}
    </div>
  );
}

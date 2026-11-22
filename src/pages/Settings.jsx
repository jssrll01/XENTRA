import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, KeyRound, LogOut, Smartphone, Trash2, User } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { getMyPresence, setPresence, listDevices, removeDevice } from '../lib/api';
import { ago } from '../lib/format';
import { pushSupported, currentSub, enablePush, disablePush } from '../lib/push';

const STATES = [['online', 'Online'], ['dnd', 'Do not disturb'], ['invisible', 'Invisible']];
const HOURS = [['0', 'Never clears'], ['1', '1 hour'], ['4', '4 hours'], ['24', '24 hours']];

export default function Settings() {
  const { signOut } = useAuth();
  const [st, setSt] = useState(null);
  const [text, setText] = useState('');
  const [hrs, setHrs] = useState('0');
  const [dev, setDev] = useState(null);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([getMyPresence(), listDevices()]);
    if (!a.ok || !b.ok) { setErr(a.ok ? b.error : a.error); return; }
    setSt(a.data.status); setText(a.data.status_text || ''); setDev(b.data || []); setErr('');
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (pushSupported()) currentSub().then((s) => setPushOn(!!s && Notification.permission === 'granted')).catch(() => {});
  }, []);
  const togglePush = async () => {
    setBusy(true); setNote('');
    const r = pushOn ? await disablePush() : await enablePush();
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setErr(''); setNote(pushOn ? 'Notifications off' : 'Notifications on'); setPushOn(!pushOn); load();
  };
  const saveStatus = async (next) => {
    setBusy(true); setNote('');
    const exp = Number(hrs) > 0 && text.trim() ? new Date(Date.now() + Number(hrs) * 3600000).toISOString() : null;
    const r = await setPresence(next || st, text, exp);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setErr(''); setNote('Status saved');
    window.dispatchEvent(new Event('xentra-presence'));
  };
  const pick = (s) => { setSt(s); saveStatus(s); };
  const changePw = async () => {
    setBusy(true); setNote('');
    const r = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (r.error) { setErr(r.error.message); return; }
    setErr(''); setPw(''); setNote('Password changed');
  };
  const drop = async (d) => {
    setBusy(true);
    const r = await removeDevice(d.id);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    load();
  };
  const clear = async () => {
    if (!window.confirm('Clear cached data? Unsent drafts are removed too.')) return;
    try {
      const ks = await caches.keys();
      await Promise.all(ks.map((k) => caches.delete(k)));
      Object.keys(localStorage).filter((k) => k.indexOf('xentra-draft-') === 0).forEach((k) => localStorage.removeItem(k));
      setNote('Cache cleared');
    } catch (x) { setErr('Could not clear the cache.'); }
  };
  return (
    <>
      <div className="page-head"><h2>Settings</h2></div>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}>Retry</button></div> : null}
      {note ? <div className="alert info">{note}</div> : null}
      <section className="glass card add-card">
        <h2>Status</h2>
        {!st ? <Skeleton rows={2} /> : (
          <>
            <div className="chips">
              {STATES.map((s) => <button type="button" key={s[0]} className={'chip' + (st === s[0] ? ' on' : '')} disabled={busy} onClick={() => pick(s[0])}>{s[1]}</button>)}
            </div>
            <input type="text" placeholder="Custom status" aria-label="Custom status" maxLength={80} value={text} onChange={(e) => setText(e.target.value)} />
            <select aria-label="Clear status after" value={hrs} onChange={(e) => setHrs(e.target.value)}>
              {HOURS.map((h) => <option key={h[0]} value={h[0]}>{h[1]}</option>)}
            </select>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => saveStatus()}>Save status</button>
          </>
        )}
      </section>
      <section className="glass card add-card">
        <h2>Account</h2>
        <Link className="btn btn-secondary btn-sm" to="/profile"><User size={16} /> Edit profile</Link>
        <input type="password" placeholder="New password (8+ characters)" aria-label="New password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy || pw.length < 8} onClick={changePw}><KeyRound size={16} /> Change password</button>
      </section>
      <section className="glass card add-card">
        <h2>Notifications</h2>
        {pushSupported() ? (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={togglePush}><Bell size={16} /> {pushOn ? 'Turn off on this device' : 'Turn on for this device'}</button>
        ) : <p className="note">This browser does not support push notifications. On iPhone, add XENTRA to the Home Screen first.</p>}
        <p className="note">Muted chats and Do not disturb stay silent.</p>
      </section>
      <section className="glass card">
        <div className="card-head"><h2>Devices</h2></div>
        {!dev ? <Skeleton rows={1} /> : null}
        {dev && dev.length === 0 ? <EmptyState icon={Smartphone} title="No devices" text="Devices with notifications turned on appear here." /> : null}
        {dev && dev.length > 0 ? (
          <div className="rows">
            {dev.map((d) => (
              <div className="row static" key={d.id}>
                <Smartphone size={18} />
                <div className="row-main"><b>{(d.user_agent || 'Device').slice(0, 40)}</b><span>Active {ago(d.last_used_at || d.created_at)} ago</span></div>
                <button type="button" className="icon-btn" aria-label="Remove device" disabled={busy} onClick={() => drop(d)}><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
      <section className="glass card add-card">
        <h2>Data</h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={clear}><Trash2 size={16} /> Clear cache</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={signOut}><LogOut size={16} /> Sign out</button>
      </section>
    </>
  );
}

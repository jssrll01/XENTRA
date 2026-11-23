import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ChevronRight, CircleDot, Database, Info, KeyRound, Lock, LogOut, Mail, Palette, Pencil, ShieldCheck, Smartphone, Trash2, User } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useProfile } from '../lib/profile';
import { getMyPresence, setPresence, listDevices, removeDevice } from '../lib/api';
import { ago, fullName } from '../lib/format';
import { pushSupported, currentSub, enablePush, disablePush } from '../lib/push';
import { getTheme, applyTheme } from '../lib/theme';

import PrivacyPanel from '../components/PrivacyPanel';
import ActivityPanel from '../components/ActivityPanel';
import { Eye as EyeIcon, History as HistoryIcon } from 'lucide-react';
const STATES = [['online', 'Online'], ['dnd', 'Do not disturb'], ['invisible', 'Invisible']];
const HOURS = [['0', 'Never clears'], ['1', '1 hour'], ['4', '4 hours'], ['24', '24 hours']];
const THEMES = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];

function Row({ icon: Icon, title, sub, id, open, setOpen, tag, children }) {
  const on = open === id;
  return (
    <div className="sx-item">
      <button type="button" className="sx-row" aria-expanded={on} onClick={() => setOpen(on ? '' : id)}>
        <span className="sx-ic"><Icon size={22} /></span>
        <span className="sx-txt"><b>{title}</b><span>{sub}</span></span>
        {tag ? <span className="sx-tag">{tag}</span> : null}
        <ChevronRight size={20} className={'sx-chev' + (on ? ' on' : '')} />
      </button>
      {on ? <div className="sx-panel">{children}</div> : null}
    </div>
  );
}

export default function Settings() {
  const { signOut } = useAuth();
  const { profile } = useProfile();
  const [open, setOpen] = useState('');
  const [st, setSt] = useState(null);
  const [text, setText] = useState('');
  const [hrs, setHrs] = useState('0');
  const [dev, setDev] = useState(null);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [theme, setTheme] = useState(getTheme());
  const name = fullName(profile);
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
    if (!window.confirm('Clear cached data?')) return;
    try {
      const ks = await caches.keys();
      await Promise.all(ks.map((k) => caches.delete(k)));
      
      setNote('Cache cleared');
    } catch (x) { setErr('Could not clear the cache.'); }
  };
  const plabel = (STATES.find((s) => s[0] === st) || [0, ''])[1];
  const tlabel = (THEMES.find((t) => t[0] === theme) || [0, ''])[1];
  const R = { open, setOpen };
  return (
    <>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}>Retry</button></div> : null}
      {note ? <div className="alert info" role="status">{note}</div> : null}

      <section className="glass card sx-me">
        <Avatar name={name} url={profile.avatar_url} size={72} presence={st === 'online' ? 'online' : st === 'dnd' ? 'dnd' : undefined} />
        <div className="sx-who"><b>{name}</b><span>{profile.email}</span></div>
        <Link className="sx-edit" to="/profile"><Pencil size={16} /> Edit Profile</Link>
      </section>

      <section className="glass card sx-group">
        <Row {...R} id="account" icon={User} title="Account Information" sub="View your account details">
          <label className="sx-lbl">Email<input type="email" value={profile.email || ''} readOnly disabled aria-label="Email (cannot be changed)" /></label>
          <p className="note"><Mail size={14} /> Your email cannot be changed.</p>
          <label className="sx-lbl">Username<input type="text" value={profile.username ? '@' + profile.username : ''} readOnly disabled aria-label="Username" /></label>
          <Link className="btn btn-secondary btn-sm" to="/profile"><Pencil size={16} /> Edit name, username, phone and photo</Link>
        </Row>
        <Row {...R} id="privacy" icon={ShieldCheck} title="Privacy & Security" sub="Password and sign-in">
          <input type="password" placeholder="New password (8+ characters)" aria-label="New password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy || pw.length < 8} onClick={changePw}><KeyRound size={16} /> Change password</button>
        </Row>
        <Row {...R} id="who" icon={EyeIcon} title="Profile Privacy" sub="Who can see or contact you">
          <PrivacyPanel />
        </Row>
        <Row {...R} id="activity" icon={HistoryIcon} title="Account Activity" sub="Sign-ins and privacy changes">
          <ActivityPanel />
        </Row>
        <Row {...R} id="notif" icon={Bell} title="Notifications" sub="Push alerts and devices" tag={pushOn ? 'On' : 'Off'}>
          {pushSupported() ? (
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={togglePush}><Bell size={16} /> {pushOn ? 'Turn off on this device' : 'Turn on for this device'}</button>
          ) : <p className="note">This browser does not support push notifications. On iPhone, add XENTRA to the Home Screen first.</p>}
          <p className="note">Muted chats and Do not disturb stay silent.</p>
          {!dev ? <Skeleton rows={1} /> : null}
          {dev && dev.length === 0 ? <EmptyState icon={Smartphone} title="No devices" text="Devices with notifications turned on appear here." /> : null}
          {dev && dev.length > 0 ? (
            <div className="rows">
              {dev.map((d) => (
                <div className="row static" key={d.id}>
                  <Smartphone size={18} />
                  <div className="row-main"><b>{(d.user_agent || 'Device').slice(0, 40)}</b><span>{ago(d.last_used_at || d.created_at) === 'now' ? 'Active now' : 'Active ' + ago(d.last_used_at || d.created_at) + ' ago'}</span></div>
                  <button type="button" className="icon-btn" aria-label="Remove device" disabled={busy} onClick={() => drop(d)}><Trash2 size={18} /></button>
                </div>
              ))}
            </div>
          ) : null}
        </Row>
        <Row {...R} id="look" icon={Palette} title="Appearance" sub="Theme and display" tag={tlabel}>
          <div className="chips">
            {THEMES.map((x) => <button type="button" key={x[0]} className={'chip' + (theme === x[0] ? ' on' : '')} onClick={() => { setTheme(x[0]); applyTheme(x[0]); }}>{x[1]}</button>)}
          </div>
        </Row>
      </section>

      <section className="glass card sx-group">
        <Row {...R} id="status" icon={CircleDot} title="Status" sub="Online, Do not disturb or Invisible" tag={plabel}>
          {!st ? <Skeleton rows={2} /> : (
            <>
              <div className="chips">
                {STATES.map((s) => <button type="button" key={s[0]} className={'chip' + (st === s[0] ? ' on' : '')} disabled={busy} onClick={() => pick(s[0])}>{s[1]}</button>)}
              </div>
              <div className="chips">
                {['😀', '📚', '💼', '🎧', '🏖️', '🤒', '🚗', '🍽️'].map((e) => (
                  <button type="button" key={e} className="chip" aria-label={'Use ' + e + ' in status'} onClick={() => setText(e + ' ' + text.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, ''))}>{e}</button>
                ))}
              </div>
              <input type="text" placeholder="Custom status" aria-label="Custom status" maxLength={80} value={text} onChange={(e) => setText(e.target.value)} />
              <select aria-label="Clear status after" value={hrs} onChange={(e) => setHrs(e.target.value)}>
                {HOURS.map((h) => <option key={h[0]} value={h[0]}>{h[1]}</option>)}
              </select>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => saveStatus()}>Save status</button>
            </>
          )}
        </Row>
        <Row {...R} id="data" icon={Database} title="Storage & Data" sub="Cached data and drafts">
          <button type="button" className="btn btn-secondary btn-sm" onClick={clear}><Trash2 size={16} /> Clear cache</button>
        </Row>
        <Row {...R} id="about" icon={Info} title="About XENTRA" sub="One Ecosystem. Every Connection.">
          <p className="note"><Lock size={14} /> Powered by XMARKET.</p>
        </Row>
      </section>

      <button type="button" className="sx-out" onClick={signOut}><LogOut size={20} /> Log Out</button>
    </>
  );
}

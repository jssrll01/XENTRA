import React, { useCallback, useEffect, useState } from 'react';
import { Bell, RefreshCw, ShieldAlert } from 'lucide-react';
import { Splash } from './Guards';
import { pushSupported, pushPermission, enablePush, ensureSubscribed, currentSub } from '../lib/push';

export default function PushGate({ children }) {
  const [state, setState] = useState('checking');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (!pushSupported()) { setState('unsupported'); return; }
    const p = pushPermission();
    if (p === 'denied') { setState('blocked'); return; }
    if (p !== 'granted') { setState('ask'); return; }
    const have = await currentSub().catch(() => null);
    if (have) { setErr(''); setState('ready'); ensureSubscribed(); return; }
    const r = await ensureSubscribed();
    if (r.ok) { setErr(''); setState('ready'); } else { setErr(r.error); setState('error'); }
  }, []);

  useEffect(() => { check(); }, [check]);
  useEffect(() => {
    const vis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [check]);

  const allow = async () => {
    setBusy(true); setErr('');
    const r = await enablePush();
    setBusy(false);
    if (r.ok) { setState('ready'); return; }
    const p = pushPermission();
    if (p === 'denied') setState('blocked');
    else if (p === 'granted') { setErr(r.error); setState('error'); }
    else setErr(r.error);
  };
  const recheck = async () => { setBusy(true); await check(); setBusy(false); };

  if (state === 'ready') return children;
  if (state === 'checking') return <Splash />;

  return (
    <main className="pg-wrap" aria-labelledby="pg-title">
      <div className="pg-card">
        <span className="pg-ic">{state === 'ask' ? <Bell size={30} /> : <ShieldAlert size={30} />}</span>
        {state === 'ask' ? (
          <>
            <h1 id="pg-title">Turn on notifications</h1>
            <p>XENTRA needs notifications so you never miss a message, a mention, a reply or a community announcement. You can mute chats and use Do not disturb at any time.</p>
            {err ? <p className="pg-err" role="alert">{err}</p> : null}
            <button type="button" className="pg-btn" disabled={busy} onClick={allow}><Bell size={18} /> Allow notifications</button>
          </>
        ) : null}
        {state === 'blocked' ? (
          <>
            <h1 id="pg-title">Notifications are blocked</h1>
            <p>Allow them for XENTRA in your browser settings, then come back and tap Re-check.</p>
            <ol className="pg-steps">
              <li>Tap the lock or tune icon next to the address bar, or open the browser menu.</li>
              <li>Open Site settings, then Permissions, then Notifications.</li>
              <li>Set XENTRA to Allow.</li>
              <li>On iPhone: Settings, Notifications, XENTRA, then turn on Allow Notifications.</li>
              <li>Return here and tap Re-check.</li>
            </ol>
            <button type="button" className="pg-btn" disabled={busy} onClick={recheck}><RefreshCw size={18} /> Re-check</button>
          </>
        ) : null}
        {state === 'unsupported' ? (
          <>
            <h1 id="pg-title">Notifications are not available here</h1>
            <p>On iPhone or iPad, tap Share, then Add to Home Screen, and open XENTRA from your Home Screen. On other devices use a current version of Chrome, Edge, Firefox or Safari.</p>
            <button type="button" className="pg-btn" disabled={busy} onClick={recheck}><RefreshCw size={18} /> Re-check</button>
          </>
        ) : null}
        {state === 'error' ? (
          <>
            <h1 id="pg-title">Could not finish setup</h1>
            <p className="pg-err" role="alert">{err}</p>
            <button type="button" className="pg-btn" disabled={busy} onClick={recheck}><RefreshCw size={18} /> Retry</button>
          </>
        ) : null}
      </div>
    </main>
  );
}

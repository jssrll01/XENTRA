import React, { useCallback, useEffect, useState } from 'react';
import Select from './ui/Select';
import Skeleton from './ui/Skeleton';
import { getNotifSettings, setNotifMode, setAnnounceNotifs, listNotifTargets, setConvNotif } from '../lib/api';

const MODES = [['all', 'All messages'], ['mentions', 'Mentions and replies only'], ['none', 'None']];
const PER = [['default', 'My default'], ['all', 'All'], ['mentions', 'Mentions'], ['none', 'None']];
const kindOf = (t) => (t.channel ? 'Channel' : t.kind === 'direct' ? 'Direct' : 'Group');

export default function NotifSettings() {
  const [cfg, setCfg] = useState(null);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([getNotifSettings(), listNotifTargets()]);
    if (!a.ok || !b.ok) { setErr(a.ok ? b.error : a.error); return; }
    setCfg(a.data); setRows(b.data || []); setErr('');
  }, []);
  useEffect(() => { load(); }, [load]);

  const pickMode = async (m) => {
    setBusy(true);
    const r = await setNotifMode(m);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setErr(''); setCfg((c) => ({ ...c, mode: m }));
  };
  const pickAnn = async (on) => {
    setBusy(true);
    const r = await setAnnounceNotifs(on);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setErr(''); setCfg((c) => ({ ...c, announcements: on }));
  };
  const pickChat = async (id, v) => {
    setBusy(true);
    const r = await setConvNotif(id, v);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setErr(''); setRows((rs) => rs.map((t) => (t.conversation_id === id ? { ...t, mode: v === 'default' ? null : v } : t)));
  };

  if (err) return <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}>Retry</button></div>;
  if (!cfg || !rows) return <Skeleton rows={2} />;
  return (
    <div className="np-sec">
      <b>Message notifications</b>
      {MODES.map(([v, l]) => (
        <label className="np-opt" key={v}>
          <input type="radio" name="np-mode" checked={cfg.mode === v} disabled={busy} onChange={() => pickMode(v)} /> {l}
        </label>
      ))}
      <label className="np-opt">
        <input type="checkbox" checked={cfg.announcements} disabled={busy || cfg.mode === 'none'} onChange={(e) => pickAnn(e.target.checked)} /> Community announcements
      </label>
      <b>Per chat and channel</b>
      {rows.length === 0 ? <p className="note">Chats and channels you join will appear here.</p> : null}
      {rows.length > 0 ? (
        <div className="rows">
          {rows.map((t) => (
            <div className="row static" key={t.conversation_id}>
              <div className="row-main"><b>{t.name}</b><span>{kindOf(t)}</span></div>
              <Select className="np-sel" aria-label={'Notifications for ' + t.name} value={t.mode || 'default'} disabled={busy} onChange={(e) => pickChat(t.conversation_id, e.target.value)}>
                {PER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

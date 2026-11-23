import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getTeamRules, setTeamRules, listTeamLog } from '../lib/api';

const KIND = { join: 'Joined', leave: 'Left', role: 'Role changed', ban: 'Banned', unban: 'Unbanned', mute: 'Muted', unmute: 'Unmuted' };
const when = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const sub = (h) => (h.kind === 'mute' ? String(h.detail || '').split(' by ')[0] : (h.detail || ''));

export default function TeamRulesLog({ team, tick }) {
  const [text, setText] = useState('');
  const [log, setLog] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([getTeamRules(team.id), listTeamLog(team.id)]);
    const bad = [a, b].find((x) => !x.ok);
    if (bad) { setErr(bad.error); return; }
    setText(a.data.rules || ''); setLog(b.data || []); setErr('');
  }, [team.id]);
  useEffect(() => { load(); }, [load, tick]);
  const save = async () => {
    setBusy(true); setNote('');
    const r = await setTeamRules(team.id, text);
    setBusy(false);
    if (r.ok) { setNote('Rules saved. New joiners must accept them.'); load(); } else setErr(r.error);
  };
  return (
    <>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      <section className="glass card add-card">
        <h2>Community rules</h2>
        <textarea className="tx-area" rows={5} maxLength={2000} aria-label="Community rules" placeholder="No rules set. Joining is open." value={text} onChange={(e) => setText(e.target.value)} />
        <span className="note">{text.length}/2000. People must accept the rules before they join.</span>
        {note ? <div className="alert info" role="status">{note}</div> : null}
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save rules'}</button>
      </section>
      <section className="glass card">
        <div className="card-head"><h2>Moderation log</h2></div>
        {!log && !err ? <p className="note">Loading...</p> : null}
        {log && log.length === 0 ? <p className="note">No membership activity yet.</p> : null}
        <div className="rows">
          {(log || []).map((h) => (
            <div className="row static" key={h.id}>
              <div className="row-main"><b>{KIND[h.kind] || h.kind}: {h.name || 'Member'}</b><span>{sub(h)}</span></div>
              <span className="row-time">{when(h.created_at)}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { History } from 'lucide-react';
import Skeleton from './ui/Skeleton';
import EmptyState from './ui/EmptyState';
import { TeamErr } from './TeamSub';
import { getTeamRules, setTeamRules, listTeamLog } from '../lib/api';

const KIND = { join: 'Joined', leave: 'Left', role: 'Role changed', ban: 'Banned', unban: 'Unbanned', mute: 'Muted', unmute: 'Unmuted' };
const when = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const sub = (h) => (h.kind === 'mute' ? String(h.detail || '').split(' by ')[0] : (h.detail || ''));

export function TeamRules({ team }) {
  const [text, setText] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await getTeamRules(team.id);
    if (r.ok) { setText(r.data.rules || ''); setErr(''); } else setErr(r.error);
  }, [team.id]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    setBusy(true); setNote('');
    const r = await setTeamRules(team.id, text);
    setBusy(false);
    if (r.ok) { setErr(''); setNote('Rules saved. New joiners must accept them.'); } else setErr(r.error);
  };
  return (
    <>
      {err ? <TeamErr msg={err} retry={load} /> : null}
      {text === null && !err ? <Skeleton rows={2} /> : null}
      {text !== null ? (
        <>
          <section className="tm-card">
            <h3 className="tm-label">Rules</h3>
            <textarea className="tm-input" rows={9} maxLength={2000} aria-label="Community rules" placeholder="No rules set. Joining is open." value={text} onChange={(e) => setText(e.target.value)} />
            <p className="tm-hint">{text.length}/2000. People must accept the rules before they join.</p>
          </section>
          {note ? <div className="alert info" role="status">{note}</div> : null}
          <div className="tm-foot"><button type="button" className="tm-btn primary block" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save rules'}</button></div>
        </>
      ) : null}
    </>
  );
}

export function TeamLog({ team, tick }) {
  const [log, setLog] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const r = await listTeamLog(team.id);
    if (r.ok) { setLog(r.data || []); setErr(''); } else setErr(r.error);
  }, [team.id]);
  useEffect(() => { load(); }, [load, tick]);
  return (
    <>
      {err ? <TeamErr msg={err} retry={load} /> : null}
      {!log && !err ? <Skeleton rows={3} /> : null}
      {log ? (
        <section className="tm-card">
          {log.length === 0 ? <EmptyState icon={History} title="No activity yet" text="Joins, leaves and moderation actions appear here." /> : (
            <div className="tm-list">
              {log.map((h) => (
                <div className="tm-row static" key={h.id}>
                  <div className="tm-main"><b>{KIND[h.kind] || h.kind}: {h.name || 'Member'}</b>{sub(h) ? <span>{sub(h)}</span> : null}</div>
                  <span className="tm-time">{when(h.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}

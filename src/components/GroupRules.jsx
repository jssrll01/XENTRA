import React, { useCallback, useEffect, useState } from 'react';
import Select from './ui/Select';
import { Check, UserPlus, X } from 'lucide-react';
import PickSheet from './PickSheet';
import { getGroupRules, setGroupJoinRules, respondGroupJoinRequest, inviteToGroup } from '../lib/api';
import { fullName } from '../lib/format';

const DAYS = [[0, 'Never'], [1, '1 day'], [7, '7 days'], [30, '30 days']];

export default function GroupRules({ id, mem, onChanged }) {
  const [r, setR] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [pick, setPick] = useState(false);
  const [days, setDays] = useState(0);
  const load = useCallback(async () => {
    const x = await getGroupRules(id);
    if (x.ok) { setR(x.data); setErr(''); } else setErr(x.error);
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const save = async (approval, d) => {
    setErr(''); setNote('');
    const x = await setGroupJoinRules(id, approval, d);
    if (x.ok) { setDays(d); setNote(d > 0 ? 'Link now expires in ' + d + (d === 1 ? ' day.' : ' days.') : 'Saved.'); load(); } else setErr(x.error);
  };
  const answer = async (u, ok) => {
    const x = await respondGroupJoinRequest(id, u, ok);
    if (x.ok) { load(); if (ok) onChanged(); } else setErr(x.error);
  };
  const invite = async (ids) => {
    for (const u of ids) {
      const x = await inviteToGroup(id, u);
      if (!x.ok) return x;
    }
    return { ok: true, data: {} };
  };
  return (
    <section className="glass card">
      <div className="card-head"><h2>Join rules</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setPick(true)}><UserPlus size={16} /> Invite contacts</button>
      </div>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}>Retry</button></div> : null}
      {note ? <div className="alert info" role="status">{note}</div> : null}
      {r ? (
        <>
          <div className="chips">
            <button type="button" className={'chip' + (r.approval ? ' on' : '')} aria-pressed={r.approval} onClick={() => save(!r.approval, days)}>Admin approval for link joins</button>
          </div>
          <label className="sx-lbl">New link expiry
            <Select value={days} onChange={(e) => save(r.approval, Number(e.target.value))}>
              {DAYS.map((d) => <option key={d[0]} value={d[0]}>{d[1]}</option>)}
            </Select>
          </label>
          {r.expires_at ? <p className="note">Current link expires {new Date(r.expires_at).toLocaleDateString()}.</p> : null}
          {r.requests.length > 0 ? <h3 className="sub-h">Join requests</h3> : null}
          {r.requests.map((q) => (
            <div className="row static" key={q.user_id}>
              <div className="row-main"><b>{fullName(q)}</b><span>@{q.username}</span></div>
              <button type="button" className="icon-btn" aria-label={'Approve ' + fullName(q)} onClick={() => answer(q.user_id, true)}><Check size={18} /></button>
              <button type="button" className="icon-btn" aria-label={'Reject ' + fullName(q)} onClick={() => answer(q.user_id, false)}><X size={18} /></button>
            </div>
          ))}
        </>
      ) : null}
      {pick && mem ? <PickSheet title="Invite contacts" label="Invite" exclude={mem.map((m) => m.id)} onSubmit={invite} onClose={() => setPick(false)} onDone={() => { setPick(false); setNote('Invitations sent.'); }} /> : null}
    </section>
  );
}

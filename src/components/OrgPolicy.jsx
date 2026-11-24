import React, { useCallback, useEffect, useState } from 'react';
import { History } from 'lucide-react';
import Skeleton from './ui/Skeleton';
import EmptyState from './ui/EmptyState';
import { TeamErr } from './TeamSub';
import { getOrgPolicy, setOrgPolicy, getOrgPolicyStats, listOrgAudit } from '../lib/api';
import { timeAgo } from '../lib/format';

export function OrgAudit({ org, tick }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const r = await listOrgAudit(org.id, 100);
    if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
  }, [org.id]);
  useEffect(() => { load(); }, [load, tick]);
  return (
    <>
      {err ? <TeamErr msg={err} retry={load} /> : null}
      {!rows && !err ? <Skeleton /> : null}
      {rows && rows.length === 0 ? <EmptyState icon={History} title="No entries" text="Changes to the organization appear here." /> : null}
      {rows && rows.length > 0 ? (
        <section className="tm-card"><div className="tm-list">
          {rows.map((a) => (
            <div className="tm-row static" key={a.id}>
              <div className="tm-main"><b>{a.action}</b><span>{(a.actor ? '@' + a.actor : 'System') + (a.detail ? ' - ' + a.detail : '')}</span></div>
              <span className="tm-time">{timeAgo(a.created_at)}</span>
            </div>
          ))}
        </div></section>
      ) : null}
    </>
  );
}

export default function OrgPolicy({ org, tick }) {
  const [p, setP] = useState(null);
  const [st, setSt] = useState(null);
  const [who, setWho] = useState('admins');
  const [appr, setAppr] = useState(false);
  const [dom, setDom] = useState('');
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await getOrgPolicy(org.id);
    if (!r.ok) { setErr(r.error); return; }
    setP(r.data); setWho(r.data.who_can_invite); setAppr(!!r.data.invite_approval);
    setDom((r.data.allowed_domains || []).join('\n')); setText(r.data.policy_text || ''); setErr('');
    if (org.perms && org.perms.view_audit) {
      const s = await getOrgPolicyStats(org.id);
      if (s.ok) setSt(s.data); else setErr(s.error);
    }
  }, [org.id, org.perms]);
  useEffect(() => { load(); }, [load, tick]);
  const save = async () => {
    setBusy(true); setNote('');
    const domains = dom.split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    const r = await setOrgPolicy(org.id, who, appr, domains, text);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setErr(''); setNote('Saved'); load();
  };
  return (
    <>
      {err ? <TeamErr msg={err} retry={load} /> : null}
      {note ? <div className="alert info" role="status">{note}</div> : null}
      {!p && !err ? <Skeleton /> : null}
      {p ? (
        <section className="tm-card">
          <label className="tm-lbl">Who can invite
            <select className="tm-input" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="admins">Admins and owner</option>
              <option value="managers">Managers and above</option>
              <option value="members">All members</option>
            </select>
          </label>
          <label className="org-check"><input type="checkbox" checked={appr} onChange={(e) => setAppr(e.target.checked)} /> Require approval to join by link</label>
          <label className="tm-lbl">Allowed email domains
            <textarea className="tm-input" rows={3} placeholder="example.com" value={dom} onChange={(e) => setDom(e.target.value)} />
          </label>
          <p className="tm-hint">One per line. Leave empty to allow any domain.</p>
          <label className="tm-lbl">Organization policy
            <textarea className="tm-input" rows={6} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <p className="tm-hint">Version {p.policy_version}. Changing the text creates a new version that people must accept to join.{st ? ' Accepted by ' + st.accepted + ' of ' + st.total + ' members.' : ''}</p>
          <button type="button" className="tm-btn primary block" disabled={busy} onClick={save}>Save</button>
        </section>
      ) : null}
    </>
  );
}

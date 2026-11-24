import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import Skeleton from '../components/ui/Skeleton';
import { TeamErr } from '../components/TeamSub';
import { previewOrg, acceptOrgPolicy, joinOrgByCode } from '../lib/api';

export default function JoinOrg() {
  const { code } = useParams();
  const nav = useNavigate();
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const load = useCallback(async () => {
    const r = await previewOrg(code);
    if (r.ok) { setP(r.data); setErr(''); } else setErr(r.error);
  }, [code]);
  useEffect(() => { load(); }, [load]);
  const needsPolicy = p && p.policy_text && p.policy_version > 0 && !p.policy_accepted;
  const join = async () => {
    setBusy(true);
    if (needsPolicy) {
      const a = await acceptOrgPolicy(p.id);
      if (!a.ok) { setBusy(false); setErr(a.error); return; }
    }
    const r = await joinOrgByCode(code);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    if (r.data.status === 'joined') nav('/organizations/' + r.data.id, { replace: true }); else load();
  };
  return (
    <div className="org">
      {err ? <TeamErr msg={err} retry={load} /> : null}
      {!p && !err ? <Skeleton rows={3} /> : null}
      {p ? (
        <section className="tm-card tm-center">
          <Avatar name={p.name} url={p.logo_url} size={64} />
          <div className="tm-title"><h2>{p.name}</h2><span>{p.members} {p.members === 1 ? 'member' : 'members'}</span></div>
          {p.description ? <p className="tm-hint">{p.description}</p> : null}
          {p.is_member ? <Link className="tm-btn primary" to={'/organizations/' + p.id}><Building2 size={18} /> Open organization</Link> : null}
          {!p.is_member && p.requested ? <div className="alert info">Your request is waiting for approval.</div> : null}
          {!p.is_member && !p.requested ? (
            <>
              {needsPolicy ? (
                <div className="org-policy">
                  <p className="tm-label">Organization policy (version {p.policy_version})</p>
                  <div className="org-policy-text">{p.policy_text}</div>
                  <label className="org-check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I have read and accept this policy</label>
                </div>
              ) : null}
              {p.needs_approval ? <p className="tm-hint">An admin must approve your request.</p> : null}
              <button type="button" className="tm-btn primary block" disabled={busy || (needsPolicy && !agree)} onClick={join}>{p.needs_approval ? 'Request to join' : 'Join'}</button>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

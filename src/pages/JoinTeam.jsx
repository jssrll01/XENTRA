import React, { useCallback, useEffect, useState } from 'react';
import Skeleton from '../components/ui/Skeleton';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Layers, RefreshCw, UserPlus } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import { previewTeam } from '../lib/api';
import { joinCodeWithRules } from '../lib/rules';

export default function JoinTeam() {
  const { code } = useParams();
  const nav = useNavigate();
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await previewTeam(code);
    if (r.ok) { setP(r.data); setErr(''); } else setErr(r.error);
  }, [code]);
  useEffect(() => { load(); }, [load]);
  const join = async () => {
    setBusy(true);
    const r = await joinCodeWithRules(p.id, code);
    setBusy(false);
    if (r.ok) nav('/teams/' + r.data.id); else setErr(r.error);
  };
  return (
    <section className="glass card add-card">
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {!p && !err ? <Skeleton /> : null}
      {p ? (
        <>
          <Avatar name={p.name} url={p.avatar_url} size={72} />
          <h2>{p.name}</h2>
          {p.description ? <span>{p.description}</span> : null}
          <span className="rel-tag">{p.members} members</span>
          {p.is_member
            ? <button type="button" className="btn btn-primary" onClick={() => nav('/teams/' + p.id)}><Layers size={18} /> Open team</button>
            : <button type="button" className="btn btn-primary" disabled={busy} onClick={join}><UserPlus size={18} /> Join team</button>}
        </>
      ) : null}
      <Link className="see-all" to="/teams">Back to teams</Link>
    </section>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MessageCircle, RefreshCw, UserPlus } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import { previewGroup, joinGroup } from '../lib/api';

export default function JoinGroup() {
  const { code } = useParams();
  const nav = useNavigate();
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await previewGroup(code);
    if (r.ok) { setP(r.data); setErr(''); } else setErr(r.error);
  }, [code]);
  useEffect(() => { load(); }, [load]);
  const join = async () => {
    setBusy(true);
    const r = await joinGroup(code);
    setBusy(false);
    if (r.ok) nav('/messages/' + r.data.id); else setErr(r.error);
  };
  return (
    <section className="glass card add-card">
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {!p && !err ? <div className="empty pulse">Loading...</div> : null}
      {p ? (
        <>
          <Avatar name={p.name} url={p.avatar_url} size={72} />
          <h2>{p.name}</h2>
          {p.description ? <span>{p.description}</span> : null}
          <span className="rel-tag">{p.members} members</span>
          {p.is_member
            ? <button type="button" className="btn btn-primary" onClick={() => nav('/messages/' + p.id)}><MessageCircle size={18} /> Open chat</button>
            : <button type="button" className="btn btn-primary" disabled={busy} onClick={join}><UserPlus size={18} /> Join group</button>}
        </>
      ) : null}
      <Link className="see-all" to="/messages">Back to messages</Link>
    </section>
  );
}

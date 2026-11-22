import React, { useCallback, useEffect, useState } from 'react';
import Skeleton from './ui/Skeleton';
import { RefreshCw, UserPlus } from 'lucide-react';
import Avatar from './ui/Avatar';
import EmptyState from './ui/EmptyState';
import { listRequests, respondContactRequest, cancelContactRequest } from '../lib/api';
import { useSummary } from '../lib/summary';
import { fullName } from '../lib/format';

export default function RequestsPane({ onChanged }) {
  const { tick } = useSummary();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    const r = await listRequests();
    if (r.ok) { setData(r.data); setErr(''); } else setErr(r.error);
  }, []);
  useEffect(() => { load(); }, [load, tick]);
  const act = async (id, fn) => {
    setBusy(id);
    const r = await fn();
    setBusy('');
    if (r.ok) { await load(); onChanged(); } else setErr(r.error);
  };
  const row = (r, right) => (
    <div className="row static" key={r.id}>
      <Avatar name={fullName(r.user)} url={r.user.avatar_url} size={44} />
      <div className="row-main"><b>{fullName(r.user)}</b><span>@{r.user.username}{r.mutual > 0 ? ' - ' + r.mutual + ' mutual' : ''}</span></div>
      {right}
    </div>
  );
  const none = data && data.incoming.length === 0 && data.outgoing.length === 0;
  return (
    <>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {!data && !err ? <Skeleton /> : null}
      {none ? <EmptyState icon={UserPlus} title="No requests" text="Contact requests you send and receive appear here." /> : null}
      {data && data.incoming.length > 0 ? (
        <section className="glass card">
          <div className="card-head"><h2>Received</h2></div>
          <div className="rows">
            {data.incoming.map((r) => row(r, (
              <span className="req-acts">
                <button type="button" className="btn btn-primary btn-sm" disabled={busy === r.id} onClick={() => act(r.id, () => respondContactRequest(r.id, true))}>Accept</button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy === r.id} onClick={() => act(r.id, () => respondContactRequest(r.id, false))}>Decline</button>
              </span>
            )))}
          </div>
        </section>
      ) : null}
      {data && data.outgoing.length > 0 ? (
        <section className="glass card">
          <div className="card-head"><h2>Sent</h2></div>
          <div className="rows">
            {data.outgoing.map((r) => row(r, (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy === r.id} onClick={() => act(r.id, () => cancelContactRequest(r.id))}>Cancel</button>
            )))}
          </div>
        </section>
      ) : null}
    </>
  );
}

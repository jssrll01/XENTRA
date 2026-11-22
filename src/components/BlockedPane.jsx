import React, { useCallback, useEffect, useState } from 'react';
import { Ban, RefreshCw } from 'lucide-react';
import Avatar from './ui/Avatar';
import EmptyState from './ui/EmptyState';
import { listBlocks, unblockUser } from '../lib/api';
import { fullName } from '../lib/format';

export default function BlockedPane({ onChanged }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    const r = await listBlocks();
    if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  const unblock = async (p) => {
    setBusy(p.id);
    const r = await unblockUser(p.id);
    setBusy('');
    if (r.ok) { await load(); onChanged(); } else setErr(r.error);
  };
  return (
    <>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {!rows && !err ? <div className="empty pulse">Loading...</div> : null}
      {rows && rows.length === 0 ? <EmptyState icon={Ban} title="No blocked people" text="People you block cannot message you or send requests." /> : null}
      {rows && rows.length > 0 ? (
        <section className="glass card">
          <div className="rows">
            {rows.map((p) => (
              <div className="row static" key={p.id}>
                <Avatar name={fullName(p)} url={p.avatar_url} size={44} />
                <div className="row-main"><b>{fullName(p)}</b><span>@{p.username}</span></div>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy === p.id} onClick={() => unblock(p)}>Unblock</button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

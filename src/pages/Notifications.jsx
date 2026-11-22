import React, { useCallback, useEffect, useState } from 'react';
import Skeleton from '../components/ui/Skeleton';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import { listNotifications, markNotificationsRead } from '../lib/api';
import { useSummary } from '../lib/summary';
import { ago } from '../lib/format';

export default function Notifications() {
  const nav = useNavigate();
  const { reload } = useSummary();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await listNotifications(50);
    if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);

  const markAll = async () => {
    setBusy(true);
    const r = await markNotificationsRead(null);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    await load();
    reload();
  };
  const open = async (n) => {
    if (!n.read_at) {
      const r = await markNotificationsRead([n.id]);
      if (!r.ok) { setErr(r.error); return; }
      reload();
    }
    if (n.link) nav(n.link); else load();
  };
  const unread = rows ? rows.filter((n) => !n.read_at).length : 0;

  return (
    <>
      <div className="page-head">
        <h2>Activity</h2>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy || unread === 0} onClick={markAll}>Mark all read</button>
      </div>
      {err ? (
        <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}>Retry</button></div>
      ) : null}
      <section className="glass card">
        {rows === null && !err ? <Skeleton /> : null}
        {rows && rows.length === 0 ? <EmptyState icon={Bell} title="No activity yet" text="Invitations, mentions and updates will appear here." /> : null}
        {rows && rows.length > 0 ? (
          <div className="rows">
            {rows.map((n) => (
              <button type="button" className="row" key={n.id} onClick={() => open(n)}>
                <span className={n.read_at ? 'dot off' : 'dot'} />
                <div className="row-main"><b>{n.title}</b>{n.body ? <span>{n.body}</span> : null}</div>
                <span className="row-time">{ago(n.created_at)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}

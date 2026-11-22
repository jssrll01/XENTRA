import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import Sheet from './Sheet';
import Skeleton from './ui/Skeleton';
import { listReactors } from '../lib/api';

export default function ReactorsSheet({ message, onClose }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setErr('');
    const r = await listReactors(message.id);
    if (r.ok) setRows(r.data || []); else setErr(r.error);
  }, [message.id]);
  useEffect(() => { load(); }, [load]);
  return (
    <Sheet title="Reactions" onClose={onClose}>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {!rows && !err ? <Skeleton rows={3} /> : null}
      {rows && rows.length === 0 ? <p className="rx-empty">No reactions.</p> : null}
      {rows && rows.length ? <ul className="rx-list">{rows.map((r) => <li key={r.user_id + r.emoji}><span className="rx-e">{r.emoji}</span><span>{r.mine ? 'You' : r.name}</span></li>)}</ul> : null}
    </Sheet>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import Sheet from './Sheet';
import Avatar from './ui/Avatar';
import { mutualContacts } from '../lib/api';
import { fullName } from '../lib/format';

export default function MutualSheet({ contact, onClose }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const r = await mutualContacts(contact.id);
    if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
  }, [contact.id]);
  useEffect(() => { load(); }, [load]);
  return (
    <Sheet title={'Mutual with ' + fullName(contact)} onClose={onClose}>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {!rows && !err ? <div className="empty pulse">Loading...</div> : null}
      {rows && rows.length === 0 ? <p className="note">No mutual contacts.</p> : null}
      {rows ? rows.map((p) => (
        <div className="row static" key={p.id}>
          <Avatar name={fullName(p)} url={p.avatar_url} size={40} />
          <div className="row-main"><b>{fullName(p)}</b><span>@{p.username}</span></div>
        </div>
      )) : null}
    </Sheet>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { History, LogIn, ShieldCheck, AtSign } from 'lucide-react';
import { listMyActivity } from '../lib/api';

const FIELD = { last_seen: 'Last seen', photo: 'Profile photo', bio: 'Bio', status: 'Custom status', message: 'Who can message me', add_me: 'Who can add me' };
const VALUE = { everyone: 'Everyone', contacts: 'Contacts', nobody: 'Nobody' };
const when = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function device(ua) {
  const s = String(ua || '');
  if (/iPhone|iPad/.test(s)) return 'iPhone or iPad';
  if (/Android/.test(s)) return 'Android';
  if (/Windows/.test(s)) return 'Windows';
  if (/Mac OS/.test(s)) return 'Mac';
  if (/Linux/.test(s)) return 'Linux';
  return s ? 'Other device' : 'Unknown device';
}

function describe(a) {
  if (a.kind === 'signin') return { icon: LogIn, title: 'Signed in', sub: device(a.detail) };
  if (a.kind === 'username') return { icon: AtSign, title: 'Username changed', sub: a.detail };
  const parts = String(a.detail || '').split(' -> ');
  return { icon: ShieldCheck, title: 'Privacy changed', sub: (FIELD[parts[0]] || parts[0]) + ' set to ' + (VALUE[parts[1]] || parts[1]) };
}

export default function ActivityPanel() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const r = await listMyActivity(50);
    if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}>Retry</button></div> : null}
      {!rows && !err ? <p className="note">Loading...</p> : null}
      {rows && rows.length === 0 ? <p className="note"><History size={14} /> No activity yet. Sign-ins and privacy changes appear here.</p> : null}
      {rows && rows.length > 0 ? (
        <div className="rows">
          {rows.map((a) => {
            const d = describe(a);
            const Icon = d.icon;
            return (
              <div className="row static" key={a.id}>
                <Icon size={18} />
                <div className="row-main"><b>{d.title}</b><span>{d.sub}</span></div>
                <span className="row-time">{when(a.created_at)}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

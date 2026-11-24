import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, LogOut, UserPlus } from 'lucide-react';
import Avatar from './ui/Avatar';
import { useAuth } from '../lib/auth';
import { useProfile } from '../lib/profile';
import { ask } from '../lib/dialog';
import { listAccounts, switchAccount, signOutOne } from '../lib/accounts';

export default function AccountList({ onClose }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const nav = useNavigate();
  const [rows, setRows] = useState(() => listAccounts());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const reload = useCallback(() => setRows(listAccounts()), []);
  useEffect(() => { reload(); }, [reload]);

  const go = async (a) => {
    if (user && a.id === user.id) return;
    if (a.expired) { onClose(); nav('/add-account?email=' + encodeURIComponent(a.email)); return; }
    setBusy(true); setErr('');
    const r = await switchAccount(a.id);
    setBusy(false);
    if (!r.ok) { setErr(r.error); reload(); }
  };
  const out = async (a) => {
    if (!await ask('Sign out of ' + a.email + '?')) return;
    setBusy(true); setErr('');
    await signOutOne(a.id);
    setBusy(false);
    reload();
  };

  return (
    <div className="ac-list" role="group" aria-label="Accounts">
      {rows.map((a) => (
        <div className="ac-row" key={a.id}>
          <button type="button" role="menuitem" className="ac-main" disabled={busy} onClick={() => go(a)}>
            <Avatar name={a.name} url={a.avatar_url} size={32} />
            <span className="ac-who"><b>{a.name}</b><span>{a.expired ? 'Sign in again' : a.email}</span>{user && a.id === user.id && profile.username ? <span>@{profile.username}</span> : null}</span>
            {user && a.id === user.id ? <Check size={16} aria-label="Current account" /> : null}
          </button>
          <button type="button" className="ac-out" aria-label={'Sign out ' + a.email} disabled={busy} onClick={() => out(a)}><LogOut size={16} /></button>
        </div>
      ))}
      {err ? <p className="ac-err" role="alert">{err}</p> : null}
      <button type="button" role="menuitem" disabled={busy} onClick={() => { onClose(); nav('/add-account'); }}><UserPlus size={18} /> Add account</button>
      <div className="pop-sep" role="separator" />
    </div>
  );
}

import React, { useState } from 'react';
import { setGroupPermissions } from '../lib/api';

const ITEMS = [
  ['send', 'Send messages', 'Members can post in the chat'],
  ['edit_info', 'Edit group info', 'Members can change the name and description'],
  ['add_members', 'Add members', 'Members can add their contacts'],
  ['pin', 'Pin messages', 'Members can pin and unpin messages'],
];

export default function GroupPermissions({ id, perms, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const flip = async (k) => {
    setBusy(true); setErr('');
    const r = await setGroupPermissions(id, { [k]: !perms[k] });
    setBusy(false);
    if (r.ok) onChanged(); else setErr(r.error);
  };
  return (
    <section className="glass card">
      <div className="card-head"><h2>Member permissions</h2></div>
      <span className="note">Admins can always do all of these.</span>
      {err ? <div className="alert err" role="alert">{err}</div> : null}
      <div className="rows">
        {ITEMS.map(([k, label, hint]) => (
          <div className="row static" key={k}>
            <div className="row-main"><b>{label}</b><span>{hint}</span></div>
            <button type="button" role="switch" aria-checked={!!perms[k]} aria-label={label} className={'chip' + (perms[k] ? ' on' : '')} disabled={busy} onClick={() => flip(k)}>{perms[k] ? 'On' : 'Off'}</button>
          </div>
        ))}
      </div>
    </section>
  );
}

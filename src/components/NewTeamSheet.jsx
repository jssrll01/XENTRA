import React, { useState } from 'react';
import Sheet from './Sheet';
import { createTeam } from '../lib/api';

export default function NewTeamSheet({ onClose, onDone }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [mode, setMode] = useState('open');
  const [disc, setDisc] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const r = await createTeam(name, desc, mode, disc);
    setBusy(false);
    if (r.ok) onDone(r.data.id); else setErr(r.error);
  };
  return (
    <Sheet title="New team" onClose={onClose}>
      {err ? <div className="alert err">{err}</div> : null}
      <input type="text" placeholder="Team name" aria-label="Team name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      <input type="text" placeholder="Description (optional)" aria-label="Team description" maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} />
      <div className="chips">
        <button type="button" className={'chip' + (mode === 'open' ? ' on' : '')} onClick={() => setMode('open')}>Open to join</button>
        <button type="button" className={'chip' + (mode === 'approval' ? ' on' : '')} onClick={() => setMode('approval')}>Approval required</button>
        <button type="button" className={'chip' + (disc ? ' on' : '')} onClick={() => setDisc(!disc)}>Discoverable</button>
      </div>
      <button type="button" className="btn btn-primary btn-block" disabled={busy || !name.trim()} onClick={submit}>Create team</button>
    </Sheet>
  );
}

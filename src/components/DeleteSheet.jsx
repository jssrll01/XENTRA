import React, { useState } from 'react';
import Sheet from './Sheet';
import Button from './ui/Button';
import Field from './ui/Field';

export default function DeleteSheet({ title, name, warn, onDelete, onClose, onDone }) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ok = v.trim() === name;
  const go = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setErr('');
    const r = await onDelete(v.trim());
    setBusy(false);
    if (r.ok) onDone(); else setErr(r.error || 'Could not delete. Try again.');
  };
  return (
    <Sheet title={title} onClose={onClose}>
      <p>{warn}</p>
      <p>Type <b>{name}</b> to confirm.</p>
      <Field label="Name" value={v} autoComplete="off" onChange={(e) => setV(e.target.value)} />
      {err ? <div className="alert err" role="alert">{err}</div> : null}
      <Button block loading={busy} disabled={!ok} onClick={go}>Delete permanently</Button>
    </Sheet>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, Trash2 } from 'lucide-react';
import Sheet from './Sheet';
import { listLabels, createLabel, renameLabel, deleteLabel, setContactLabel } from '../lib/api';
import { fullName } from '../lib/format';

export default function LabelSheet({ contact, onClose, onChanged }) {
  const [labels, setLabels] = useState(null);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [edit, setEdit] = useState(null);
  const load = useCallback(async () => {
    const r = await listLabels();
    if (r.ok) { setLabels(r.data || []); setErr(''); } else setErr(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  const run = async (p) => {
    const r = await p;
    if (!r.ok) { setErr(r.error); return false; }
    setErr('');
    await load();
    onChanged();
    return true;
  };
  const add = async () => { if (await run(createLabel(name))) setName(''); };
  const save = async () => { if (await run(renameLabel(edit.id, edit.name))) setEdit(null); };
  const del = (l) => { if (window.confirm('Delete the label ' + l.name + '? Contacts keep their place.')) run(deleteLabel(l.id)); };
  const assign = async (id) => {
    const r = await setContactLabel(contact.id, id);
    if (r.ok) { onChanged(); onClose(); } else setErr(r.error);
  };
  return (
    <Sheet title={contact ? 'Label for ' + fullName(contact) : 'Labels'} onClose={onClose}>
      {err ? <div className="alert err">{err}</div> : null}
      {!labels && !err ? <div className="empty pulse">Loading...</div> : null}
      {contact ? (
        <div className="chips">
          <button type="button" className={'chip' + (!contact.label_id ? ' on' : '')} onClick={() => assign(null)}>None</button>
          {(labels || []).map((l) => <button type="button" key={l.id} className={'chip' + (contact.label_id === l.id ? ' on' : '')} onClick={() => assign(l.id)}>{l.name}</button>)}
        </div>
      ) : null}
      <h3 className="sub-h">Manage labels</h3>
      {(labels || []).map((l) => (
        <div className="lbl-row" key={l.id}>
          {edit && edit.id === l.id ? (
            <>
              <input type="text" aria-label="Label name" maxLength={24} value={edit.name} onChange={(e) => setEdit({ id: l.id, name: e.target.value })} />
              <button type="button" className="icon-btn" aria-label="Save label" onClick={save}><Check size={18} /></button>
            </>
          ) : (
            <>
              <span>{l.name} ({l.count})</span>
              <button type="button" className="icon-btn" aria-label={'Rename ' + l.name} onClick={() => setEdit({ id: l.id, name: l.name })}><Pencil size={16} /></button>
              <button type="button" className="icon-btn" aria-label={'Delete ' + l.name} onClick={() => del(l)}><Trash2 size={16} /></button>
            </>
          )}
        </div>
      ))}
      {labels && labels.length === 0 ? <p className="note">No labels yet.</p> : null}
      <div className="lbl-row">
        <input type="text" placeholder="New label" aria-label="New label" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
        <button type="button" className="btn btn-primary btn-sm" disabled={!name.trim()} onClick={add}>Add</button>
      </div>
    </Sheet>
  );
}

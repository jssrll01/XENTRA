import React, { useCallback, useEffect, useState } from 'react';
import Skeleton from './ui/Skeleton';
import { Check, Pencil, Trash2 } from 'lucide-react';
import Sheet from './Sheet';
import { listLabels, createLabel, renameLabel, deleteLabel, toggleContactLabel, setContactCategory, listContactMeta } from '../lib/api';
import { fullName } from '../lib/format';

const BASE = ['family', 'work', 'friends'];

export default function LabelSheet({ contact, onClose, onChanged }) {
  const [labels, setLabels] = useState(null);
  const [mine, setMine] = useState({ labels: [], category: null });
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [cname, setCname] = useState('');
  const [edit, setEdit] = useState(null);
  const load = useCallback(async () => {
    const [l, m] = await Promise.all([listLabels(), contact ? listContactMeta() : Promise.resolve({ ok: true, data: {} })]);
    const bad = [l, m].find((x) => !x.ok);
    if (bad) { setErr(bad.error); return; }
    setLabels(l.data || []);
    if (contact) setMine(m.data[contact.id] || { labels: [], category: null });
    setErr('');
  }, [contact]);
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
  const del = (l) => { if (window.confirm('Delete the label ' + l.name + '? Contacts keep their other labels.')) run(deleteLabel(l.id)); };
  const setCat = async (c) => { if (await run(setContactCategory(contact.id, c))) setCname(''); };
  const cats = mine.category && !BASE.includes(mine.category) ? BASE.concat([mine.category]) : BASE;
  return (
    <Sheet title={contact ? 'Labels for ' + fullName(contact) : 'Labels'} onClose={onClose}>
      {err ? <div className="alert err">{err}</div> : null}
      {!labels && !err ? <Skeleton /> : null}
      {contact && labels ? (
        <>
          <h3 className="sub-h">Labels</h3>
          <div className="chips">
            {labels.map((l) => {
              const on = mine.labels.some((x) => String(x.id) === String(l.id));
              return <button type="button" key={l.id} className={'chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => run(toggleContactLabel(contact.id, l.id, !on))}>{l.name}</button>;
            })}
          </div>
          {labels.length === 0 ? <p className="note">No labels yet. Create one below.</p> : null}
          <h3 className="sub-h">Category</h3>
          <div className="chips">
            <button type="button" className={'chip' + (!mine.category ? ' on' : '')} onClick={() => setCat('')}>None</button>
            {cats.map((k) => <button type="button" key={k} className={'chip cap' + (mine.category === k ? ' on' : '')} aria-pressed={mine.category === k} onClick={() => setCat(k)}>{k}</button>)}
          </div>
          <div className="lbl-row">
            <input type="text" placeholder="Custom category" aria-label="Custom category" maxLength={24} value={cname} onChange={(e) => setCname(e.target.value)} />
            <button type="button" className="btn btn-secondary btn-sm" disabled={!cname.trim()} onClick={() => setCat(cname)}>Set</button>
          </div>
        </>
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

import React, { useCallback, useEffect, useState } from 'react';
import Skeleton from './ui/Skeleton';
import { TeamErr } from './TeamSub';
import { getTeamCategory, setTeamCategory } from '../lib/api';
import { CATEGORIES } from '../lib/teamCategories';

export default function TeamCategory({ team }) {
  const [cat, setCat] = useState(null);
  const [sel, setSel] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await getTeamCategory(team.id);
    if (r.ok) { const c = r.data.category || ''; setCat(c); setSel(c); setErr(''); } else setErr(r.error);
  }, [team.id]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    setBusy(true); setNote('');
    const r = await setTeamCategory(team.id, sel);
    setBusy(false);
    if (r.ok) { setCat(sel); setErr(''); setNote('Saved'); } else setErr(r.error);
  };
  return (
    <>
      {err ? <TeamErr msg={err} retry={load} /> : null}
      {cat === null && !err ? <Skeleton rows={2} /> : null}
      {cat !== null ? (
        <>
          <section className="tm-card">
            <h3 className="tm-label">Category</h3>
            <p className="tm-hint">Shown in Discover so people can filter.</p>
            <div className="tm-chips" role="radiogroup" aria-label="Category">
              {[['', 'None']].concat(CATEGORIES).map(([k, l]) => <button type="button" role="radio" aria-checked={sel === k} key={k || 'none'} className="tm-chip" onClick={() => setSel(k)}>{l}</button>)}
            </div>
          </section>
          {note ? <div className="alert info" role="status">{note}</div> : null}
          <div className="tm-foot"><button type="button" className="tm-btn primary block" disabled={busy || sel === cat} onClick={save}>{busy ? 'Saving...' : 'Save category'}</button></div>
        </>
      ) : null}
    </>
  );
}

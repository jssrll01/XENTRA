import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getTeamCategory, setTeamCategory } from '../lib/api';
import { CATEGORIES } from '../lib/teamCategories';

export default function TeamCategory({ team }) {
  const [cat, setCat] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await getTeamCategory(team.id);
    if (r.ok) { setCat(r.data.category || ''); setErr(''); } else setErr(r.error);
  }, [team.id]);
  useEffect(() => { load(); }, [load]);
  const pick = async (v) => {
    setBusy(true);
    const r = await setTeamCategory(team.id, v);
    setBusy(false);
    if (r.ok) { setCat(v); setErr(''); } else setErr(r.error);
  };
  return (
    <section className="glass card">
      <div className="card-head"><h2>Category</h2></div>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      <span className="note">Shown in Discover so people can filter.</span>
      {cat !== null ? (
        <div className="filter-row">
          <button type="button" className={'chip' + (cat === '' ? ' on' : '')} disabled={busy} onClick={() => pick('')}>None</button>
          {CATEGORIES.map(([k, l]) => <button type="button" key={k} className={'chip' + (cat === k ? ' on' : '')} disabled={busy} onClick={() => pick(k)}>{l}</button>)}
        </div>
      ) : null}
    </section>
  );
}

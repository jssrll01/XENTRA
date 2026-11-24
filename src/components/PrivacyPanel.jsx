import React, { useCallback, useEffect, useState } from 'react';
import Skeleton from './ui/Skeleton';
import Select from './ui/Select';
import { getMyPrivacy, setPrivacy } from '../lib/api';

const WHO = [['everyone', 'Everyone'], ['contacts', 'My contacts'], ['nobody', 'Nobody']];
const ADD = [['everyone', 'Everyone'], ['contacts', 'People with a mutual contact'], ['nobody', 'Nobody']];
const FIELDS = [
  ['last_seen', 'Last seen and online status', WHO],
  ['photo', 'Profile photo', WHO],
  ['status', 'Custom status', WHO],
  ['message', 'Who can message me', WHO],
  ['add_me', 'Who can add me', ADD],
];

export default function PrivacyPanel() {
  const [v, setV] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await getMyPrivacy();
    if (r.ok) { setV(r.data); setErr(''); } else setErr(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);
  const change = async (k, val) => {
    setBusy(true); setErr('');
    const r = await setPrivacy({ [k]: val });
    setBusy(false);
    if (r.ok) setV((p) => ({ ...p, [k]: val })); else setErr(r.error);
  };
  return (
    <>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}>Retry</button></div> : null}
      {!v && !err ? <Skeleton rows={2} /> : null}
      {v ? FIELDS.map((f) => (
        <label className="sx-lbl" key={f[0]}>{f[1]}
          <Select value={v[f[0]]} disabled={busy} onChange={(e) => change(f[0], e.target.value)}>
            {f[2].map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
          </Select>
        </label>
      )) : null}
      <p className="note">People you have blocked never see your profile. Changes apply immediately.</p>
    </>
  );
}

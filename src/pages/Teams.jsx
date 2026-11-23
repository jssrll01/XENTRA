import React, { useCallback, useEffect, useState } from 'react';
import Skeleton from '../components/ui/Skeleton';
import { Link, useNavigate } from 'react-router-dom';
import { Clock, Layers, Plus, RefreshCw, Search as SearchIcon } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';
import NewTeamSheet from '../components/NewTeamSheet';
import { listMyTeams, discoverTeams } from '../lib/api';
import { joinWithRules } from '../lib/rules';
import { useSummary } from '../lib/summary';

export default function Teams() {
  const nav = useNavigate();
  const { tick } = useSummary();
  const [tab, setTab] = useState('mine');
  const [mine, setMine] = useState(null);
  const [found, setFound] = useState(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(false);
  const loadMine = useCallback(async () => {
    const r = await listMyTeams();
    if (r.ok) { setMine(r.data || []); setErr(''); } else setErr(r.error);
  }, []);
  const loadFound = useCallback(async () => {
    const r = await discoverTeams(q);
    if (r.ok) { setFound(r.data || []); setErr(''); } else setErr(r.error);
  }, [q]);
  useEffect(() => { loadMine(); }, [loadMine, tick]);
  useEffect(() => {
    if (tab !== 'find') return undefined;
    const t = setTimeout(loadFound, 250);
    return () => clearTimeout(t);
  }, [tab, loadFound, tick]);
  const join = async (t) => {
    setBusy(t.id);
    const r = await joinWithRules(t.id);
    setBusy('');
    if (!r.ok) { setErr(r.error); return; }
    if (r.data.status === 'joined') nav('/teams/' + t.id); else { setNote('Request sent to ' + t.name); loadFound(); }
  };
  return (
    <>
      <div className="page-head">
        <h2>Teams</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}><Plus size={16} /> New</button>
      </div>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={tab === 'find' ? loadFound : loadMine}><RefreshCw size={16} /> Retry</button></div> : null}
      {note ? <div className="alert info">{note}</div> : null}
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>My teams</button>
        <button type="button" role="tab" aria-selected={tab === 'find'} className={tab === 'find' ? 'on' : ''} onClick={() => setTab('find')}>Discover</button>
      </div>
      {tab === 'mine' ? (
        <>
          {!mine && !err ? <Skeleton /> : null}
          {mine && mine.length === 0 ? <EmptyState icon={Layers} title="No teams yet" text="Create a team, or open Discover to find one." /> : null}
          {mine && mine.length > 0 ? (
            <section className="glass card"><div className="rows">
              {mine.map((t) => (
                <Link className="row" key={t.id} to={'/teams/' + t.id}>
                  <Avatar name={t.name} url={t.avatar_url} size={46} />
                  <div className="row-main"><b>{t.name}</b><span>{t.members} members - {t.channels} channels</span></div>
                  {t.my_role !== 'member' ? <span className="rel-tag">{t.my_role}</span> : null}
                </Link>
              ))}
            </div></section>
          ) : null}
        </>
      ) : (
        <>
          <label className="chat-find"><SearchIcon size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teams" aria-label="Search teams" /></label>
            {!found && !err ? <Skeleton /> : null}
          {found && found.length === 0 ? <EmptyState icon={SearchIcon} title="No teams found" text="Try a different search." /> : null}
          {found && found.length > 0 ? (
            <section className="glass card"><div className="rows">
              {found.map((t) => (
                <div className="row static" key={t.id}>
                  <Avatar name={t.name} url={t.avatar_url} size={46} />
                  <div className="row-main"><b>{t.name}</b><span>{t.description || t.members + ' members'}</span></div>
                  {t.is_member ? <Link className="btn btn-secondary btn-sm" to={'/teams/' + t.id}>Open</Link>
                    : t.requested ? <span className="rel-tag"><Clock size={14} /> Requested</span>
                    : <button type="button" className="btn btn-primary btn-sm" disabled={busy === t.id} onClick={() => join(t)}>{t.join_mode === 'open' ? 'Join' : 'Request'}</button>}
                </div>
              ))}
            </div></section>
          ) : null}
        </>
      )}
      {open ? <NewTeamSheet onClose={() => setOpen(false)} onDone={(id) => { setOpen(false); nav('/teams/' + id); }} /> : null}
    </>
  );
}

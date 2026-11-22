import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, Ellipsis, MessageCircle, QrCode, RefreshCw, ScanLine, Search as SearchIcon, Star, Tag, UserMinus, Users } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';
import CodeSheet from '../components/CodeSheet';
import ScanSheet from '../components/ScanSheet';
import LabelSheet from '../components/LabelSheet';
import MutualSheet from '../components/MutualSheet';
import PickSheet from '../components/PickSheet';
import RequestsPane from '../components/RequestsPane';
import BlockedPane from '../components/BlockedPane';
import { listContacts, listLabels, listRequests, startDirect, setFavorite, removeContact, blockUser, createGroup } from '../lib/api';
import { useSummary } from '../lib/summary';
import { fullName } from '../lib/format';

export default function Contacts() {
  const nav = useNavigate();
  const { tick, reload: reloadSummary } = useSummary();
  const [rows, setRows] = useState(null);
  const [labels, setLabels] = useState([]);
  const [pending, setPending] = useState(0);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('contacts');
  const [lab, setLab] = useState('all');
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const [c, l, r] = await Promise.all([listContacts(), listLabels(), listRequests()]);
    const bad = [c, l, r].find((x) => !x.ok);
    if (bad) { setErr(bad.error); return; }
    setRows(c.data || []);
    setLabels(l.data || []);
    setPending((r.data.incoming || []).length);
    setErr('');
  }, []);
  useEffect(() => { load(); }, [load, tick]);

  const act = async (fn) => {
    setMenu(null);
    const r = await fn();
    if (r.ok) { load(); reloadSummary(); } else setErr(r.error);
  };
  const message = async (c) => {
    setMenu(null); setBusy(c.id);
    const r = await startDirect(c.id);
    setBusy('');
    if (r.ok) nav('/messages/' + r.data.id); else setErr(r.error);
  };
  const cur = lab !== 'all' && lab !== 'fav' && !labels.some((l) => l.id === lab) ? 'all' : lab;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows || []).filter((c) => (cur === 'all' || (cur === 'fav' ? c.favorite : c.label_id === cur))
      && (!t || (fullName(c) + ' ' + (c.username || '')).toLowerCase().includes(t)));
  }, [rows, cur, q]);

  return (
    <>
      <div className="page-head">
        <h2>Contacts</h2>
        <span className="req-acts">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSheet({ t: 'group' })}><Users size={16} /> Group</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSheet({ t: 'scan' })}><ScanLine size={16} /> Scan</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setSheet({ t: 'code' })}><QrCode size={16} /> My code</button>
        </span>
      </div>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {!rows && !err ? <div className="empty"><p>Loading...</p></div> : null}
      {rows ? (
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'contacts'} className={tab === 'contacts' ? 'on' : ''} onClick={() => setTab('contacts')}>Contacts ({rows.length})</button>
          <button type="button" role="tab" aria-selected={tab === 'requests'} className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>{pending ? 'Requests (' + pending + ')' : 'Requests'}</button>
          <button type="button" role="tab" aria-selected={tab === 'blocked'} className={tab === 'blocked' ? 'on' : ''} onClick={() => setTab('blocked')}>Blocked</button>
        </div>
      ) : null}
      {rows && tab === 'contacts' ? (
        <>
          <label className="chat-find"><SearchIcon size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts" aria-label="Search contacts" /></label>
          <div className="chips">
            <button type="button" className={'chip' + (cur === 'all' ? ' on' : '')} onClick={() => setLab('all')}>All</button>
            <button type="button" className={'chip' + (cur === 'fav' ? ' on' : '')} onClick={() => setLab('fav')}><Star size={14} /> Favorites</button>
            {labels.map((l) => <button type="button" key={l.id} className={'chip' + (cur === l.id ? ' on' : '')} onClick={() => setLab(l.id)}>{l.name} ({l.count})</button>)}
            <button type="button" className="chip" onClick={() => setSheet({ t: 'labels', c: null })}><Tag size={14} /> Labels</button>
          </div>
          {rows.length === 0 ? <EmptyState icon={Users} title="No contacts yet" text="Search people, or share your code, to add contacts." /> : null}
          {rows.length > 0 && shown.length === 0 ? <EmptyState icon={SearchIcon} title="No matches" text="Try a different search or filter." /> : null}
          {shown.length > 0 ? (
            <section className="glass card">
              <div className="rows">
                {shown.map((c) => (
                  <div className="conv" key={c.id}>
                    <div className="row static">
                      <Avatar name={fullName(c)} url={c.avatar_url} size={46} />
                      <div className="row-main"><b>{fullName(c)}{c.favorite ? <Star size={13} className="ci" /> : null}</b><span>@{c.username}{c.label ? ' - ' + c.label : ''}{c.mutual > 0 ? ' - ' + c.mutual + ' mutual' : ''}</span></div>
                    </div>
                    <button type="button" className="icon-btn" aria-label={'Message ' + fullName(c)} disabled={busy === c.id} onClick={() => message(c)}><MessageCircle size={20} /></button>
                    <button type="button" className="icon-btn" aria-label="Contact options" aria-expanded={menu === c.id} onClick={() => setMenu(menu === c.id ? null : c.id)}><Ellipsis size={20} /></button>
                    {menu === c.id ? (
                      <div className="conv-acts">
                        <button type="button" onClick={() => act(() => setFavorite(c.id, !c.favorite))}><Star size={16} /> {c.favorite ? 'Remove favorite' : 'Favorite'}</button>
                        <button type="button" onClick={() => { setMenu(null); setSheet({ t: 'labels', c }); }}><Tag size={16} /> Label</button>
                        {c.mutual > 0 ? <button type="button" onClick={() => { setMenu(null); setSheet({ t: 'mutual', c }); }}><Users size={16} /> Mutual</button> : null}
                        <button type="button" onClick={() => { if (window.confirm('Remove ' + fullName(c) + ' from your contacts?')) act(() => removeContact(c.id)); }}><UserMinus size={16} /> Remove</button>
                        <button type="button" onClick={() => { if (window.confirm('Block ' + fullName(c) + '? They are removed from your contacts and cannot message you.')) act(() => blockUser(c.id)); }}><Ban size={16} /> Block</button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
      {rows && tab === 'requests' ? <RequestsPane onChanged={() => { load(); reloadSummary(); }} /> : null}
      {rows && tab === 'blocked' ? <BlockedPane onChanged={load} /> : null}
      {sheet && sheet.t === 'code' ? <CodeSheet onClose={() => setSheet(null)} /> : null}
      {sheet && sheet.t === 'scan' ? <ScanSheet onClose={() => setSheet(null)} /> : null}
      {sheet && sheet.t === 'labels' ? <LabelSheet contact={sheet.c} onClose={() => setSheet(null)} onChanged={load} /> : null}
      {sheet && sheet.t === 'group' ? <PickSheet title="New group" label="Create" withName onSubmit={(ids, n, d) => createGroup(n, ids, d)} onClose={() => setSheet(null)} onDone={(r) => { setSheet(null); nav('/messages/' + r.data.id); }} /> : null}
      {sheet && sheet.t === 'mutual' ? <MutualSheet contact={sheet.c} onClose={() => setSheet(null)} /> : null}
    </>
  );
}

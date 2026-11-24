import { pressProps } from '../lib/longpress';
import { useExitValue } from '../lib/useExit';
import { ask } from '../lib/dialog';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Skeleton from '../components/ui/Skeleton';
import { useNavigate } from 'react-router-dom';
import { Ban, Ellipsis, MessageCircle, RefreshCw, Search as SearchIcon, Star, Tag, UserMinus, Users } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import Select from '../components/ui/Select';
import EmptyState from '../components/ui/EmptyState';
import LabelSheet from '../components/LabelSheet';
import MutualSheet from '../components/MutualSheet';
import RequestsPane from '../components/RequestsPane';
import BlockedPane from '../components/BlockedPane';
import { listContactMeta, listContacts, listLabels, listRequests, startDirect, setFavorite, removeContact, blockUser } from '../lib/api';
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
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(null);
  const menuX = useExitValue(menu);
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (!menu) return undefined;
    const off = (e) => { if (e.target.closest && e.target.closest('.conv-acts')) return; setMenu(null); };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [menu]);

  const load = useCallback(async () => {
    const [c, l, r, m] = await Promise.all([listContacts(), listLabels(), listRequests(), listContactMeta()]);
    const bad = [c, l, r, m].find((x) => !x.ok);
    if (bad) { setErr(bad.error); return; }
    setRows((c.data || []).map((x) => ({ ...x, labels: (m.data[x.id] && m.data[x.id].labels) || [], category: (m.data[x.id] && m.data[x.id].category) || null })));
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
  const cur = lab !== 'all' && lab !== 'fav' && !labels.some((l) => String(l.id) === String(lab)) ? 'all' : lab;
  const cats = useMemo(() => {
    const s = new Set(['family', 'work', 'friends']);
    (rows || []).forEach((c) => { if (c.category) s.add(c.category); });
    return Array.from(s);
  }, [rows]);
  const catCur = cat === 'all' || cats.includes(cat) ? cat : 'all';
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows || []).filter((c) => (cur === 'all' || (cur === 'fav' ? c.favorite : c.labels.some((x) => String(x.id) === String(cur))))
      && (catCur === 'all' || c.category === catCur)
      && (!t || (fullName(c) + ' ' + (c.username || '')).toLowerCase().includes(t)));
  }, [rows, cur, catCur, q]);

  return (
    <>
      <div className="page-head">
        <h2>Contacts</h2>
      </div>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {!rows && !err ? <Skeleton rows={3} /> : null}
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
          <div className="filter-bar">
            <Select aria-label="Filter contacts" value={String(cur)} onChange={(e) => setLab(e.target.value)}>
              <option value="all">All contacts</option>
              <option value="fav">Favorites</option>
              {labels.map((l) => <option key={l.id} value={String(l.id)}>{l.name} ({l.count})</option>)}
            </Select>
            <Select aria-label="Category" value={catCur} onChange={(e) => setCat(e.target.value)}>
              {['all'].concat(cats).map((k) => <option key={k} value={k}>{k === 'all' ? 'Any category' : k.charAt(0).toUpperCase() + k.slice(1)}</option>)}
            </Select>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSheet({ t: 'labels', c: null })}><Tag size={14} /> Manage labels</button>
          </div>
          {rows.length === 0 ? <EmptyState icon={Users} title="No contacts yet" text="Search people, or share your code, to add contacts." /> : null}
          {rows.length > 0 && shown.length === 0 ? <EmptyState icon={SearchIcon} title="No matches" text="Try a different search or filter." /> : null}
          {shown.length > 0 ? (
            <section className="glass card">
              <div className="rows">
                {shown.map((c) => (
                  <div className="conv" key={c.id}>
                    <div className="row static" {...pressProps(() => setMenu(c.id))}>
                      <Avatar name={fullName(c)} url={c.avatar_url} size={46} />
                      <div className="row-main"><b>{fullName(c)}{c.favorite ? <Star size={13} className="ci" /> : null}</b><span>@{c.username}{c.category ? ' - ' + c.category : ''}{c.labels.length ? ' - ' + c.labels.map((x) => x.name).join(', ') : ''}{c.mutual > 0 ? ' - ' + c.mutual + ' mutual' : ''}</span></div>
                    </div>
                    <button type="button" className="icon-btn" aria-label={'Message ' + fullName(c)} disabled={busy === c.id} onClick={() => message(c)}><MessageCircle size={20} /></button>
                    {menuX.value === c.id ? (
                      <div className={'conv-acts' + (menuX.out ? ' out' : '')}>
                        <button type="button" onClick={() => act(() => setFavorite(c.id, !c.favorite))}><Star size={16} /> {c.favorite ? 'Remove favorite' : 'Favorite'}</button>
                        <button type="button" onClick={() => { setMenu(null); setSheet({ t: 'labels', c }); }}><Tag size={16} /> Labels and category</button>
                        {c.mutual > 0 ? <button type="button" onClick={() => { setMenu(null); setSheet({ t: 'mutual', c }); }}><Users size={16} /> Mutual</button> : null}
                        <button type="button" onClick={async () => { if (await ask('Remove ' + fullName(c) + ' from your contacts?')) act(() => removeContact(c.id)); }}><UserMinus size={16} /> Remove</button>
                        <button type="button" onClick={async () => { if (await ask('Block ' + fullName(c) + '? They are removed from your contacts and cannot message you.')) act(() => blockUser(c.id)); }}><Ban size={16} /> Block</button>
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
      {sheet && sheet.t === 'labels' ? <LabelSheet contact={sheet.c} onClose={() => setSheet(null)} onChanged={load} /> : null}
      {sheet && sheet.t === 'mutual' ? <MutualSheet contact={sheet.c} onClose={() => setSheet(null)} /> : null}
    </>
  );
}

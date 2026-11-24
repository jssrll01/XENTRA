import { pressProps } from '../lib/longpress';
import { useExitValue } from '../lib/useExit';
import GroupInvitesSheet from '../components/GroupInvitesSheet';
import { ask } from '../lib/dialog';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, Bell, BellOff, Ellipsis, MessageCircle, Pin, PinOff, Plus, RefreshCw, Search as SearchIcon, X } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import ConvRow from '../components/ConvRow';
import { Trash2 as TrashIcon, MailOpen as UnreadIcon, Users as GroupIcon, Download as DownIcon, Inbox as InboxIcon } from 'lucide-react';
import PickSheet from '../components/PickSheet';
import ExportSheet from '../components/ExportSheet';
import { listConversations, setFlags, setMute, deleteConversation, startDirect, searchAllMessages, createGroup } from '../lib/api';
import { clock, dayLabel } from '../lib/chatTime';
import { searchPeople } from '../lib/search';
import { useProfile } from '../lib/profile';
import { useSummary } from '../lib/summary';
import { fullName } from '../lib/format';

export default function Messages() {
  const nav = useNavigate();
  const { profile } = useProfile();
  const { tick } = useSummary();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const [serr, setSerr] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('chats');
  const [muteFor, setMuteFor] = useState(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [expFor, setExpFor] = useState(null);
  const [menu, setMenu] = useState(null);
  const menuX = useExitValue(menu);
  const [cq, setCq] = useState('');
  const [hits, setHits] = useState(null);
  const [herr, setHerr] = useState('');
  const [rt, setRt] = useState(0);
  const [ginv, setGinv] = useState(false);
  useEffect(() => {
    if (!menu) return undefined;
    const off = (e) => { if (e.target.closest && e.target.closest('.conv-acts')) return; setMenu(null); };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [menu]);

  const load = useCallback(async () => {
    const r = await listConversations();
    if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
  }, []);
  useEffect(() => { load(); }, [load, tick]);
  useEffect(() => {
    const t = cq.trim();
    if (t.length < 2) { setHits(null); setHerr(''); return undefined; }
    let live = true;
    const timer = setTimeout(async () => {
      const r = await searchAllMessages(t);
      if (!live) return;
      if (r.ok) { setHits(r.data || []); setHerr(''); } else setHerr(r.error);
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [cq, rt]);
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    const t = setTimeout(async () => {
      const r = await searchPeople(q, profile.id);
      if (!live) return;
      if (r.ok) { setFound(r.data); setSerr(''); } else setSerr(r.error);
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, open, profile.id]);

  const start = async (p) => {
    setBusy(true);
    const r = await startDirect(p.id);
    setBusy(false);
    if (r.ok) nav('/messages/' + r.data.id); else setSerr(r.error);
  };
  const flag = async (c, patch) => {
    setMenu(null);
    const r = await setFlags(c.id, patch);
    if (r.ok) load(); else setErr(r.error);
  };
  const MUTE_OPTS = [{ t: 'For 1 hour', s: 3600 }, { t: 'For 8 hours', s: 28800 }, { t: 'For 1 week', s: 604800 }, { t: 'Until I unmute', s: null }];
  const mute = async (c, secs) => {
    setMenu(null); setMuteFor(null);
    const r = secs === 'off' ? await setMute(c.id, null, true) : await setMute(c.id, secs, false);
    if (r.ok) load(); else setErr(r.error);
  };
  const del = async (c) => {
    setMenu(null);
    if (!await ask('Delete this chat for you? History is hidden until a new message arrives. Other members keep theirs.')) return;
    const r = await deleteConversation(c.id);
    if (r.ok) load(); else setErr(r.error);
  };
  const needle = cq.trim().toLowerCase();
  const shown = (rows || []).filter((c) => (needle ? fullName(c.other).toLowerCase().indexOf(needle) >= 0 : (tab === 'archived' ? c.archived : !c.archived && (tab !== 'unread' || c.unread > 0))));
  const nArch = (rows || []).filter((c) => c.archived).length;
  const searching = q.trim().length >= 2;

  return (
    <>
      <div className="page-head">
        <h2>Messages</h2>
        <div className="head-acts">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setGroupOpen(true)}><GroupIcon size={16} /> New group</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(!open)}>{open ? <X size={16} /> : <Plus size={16} />} {open ? 'Close' : 'New'}</button>
        </div>
      </div>
      {open ? (
        <section className="glass card">
          <label className="chat-find"><SearchIcon size={18} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" /></label>
          {serr ? <div className="alert err">{serr}</div> : null}
          {searching && found && found.length === 0 && !serr ? <div className="empty"><p>No people found.</p></div> : null}
          {searching && found && found.length > 0 ? (
            <div className="rows">
              {found.map((p) => (
                <button type="button" className="row" key={p.id} disabled={busy} onClick={() => start(p)}>
                  <Avatar name={fullName(p)} url={p.avatar_url} size={42} />
                  <div className="row-main"><b>{fullName(p)}</b><span>@{p.username}</span></div>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {!rows && !err ? <Skeleton rows={3} /> : null}
      {groupOpen ? <PickSheet title="New group" label="Create" withName onSubmit={(ids, n, d) => createGroup(n, ids, d)} onClose={() => setGroupOpen(false)} onDone={(r) => { setGroupOpen(false); nav('/messages/' + r.data.id); }} /> : null}
      {ginv ? <GroupInvitesSheet onClose={() => setGinv(false)} onJoined={(cid) => { setGinv(false); nav('/messages/' + cid); }} /> : null}
      {expFor ? <ExportSheet conv={expFor} onClose={() => setExpFor(null)} /> : null}
      {rows ? (
        <div className="msg-find">
          <label className="chat-find"><SearchIcon size={18} />
            <input value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Search chats and messages" aria-label="Search chats and messages" />
            {cq ? <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setCq('')}><X size={18} /></button> : null}
          </label>
        </div>
      ) : null}
      {rows ? (
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'chats'} className={tab === 'chats' ? 'on' : ''} onClick={() => setTab('chats')}>Chats</button>
          <button type="button" role="tab" aria-selected={tab === 'archived'} className={tab === 'archived' ? 'on' : ''} onClick={() => setTab('archived')}>{nArch ? 'Archived (' + nArch + ')' : 'Archived'}</button>
          <button type="button" role="tab" aria-selected={tab === 'unread'} className={tab === 'unread' ? 'on' : ''} onClick={() => setTab('unread')}><UnreadIcon size={15} /> Unread</button>
          <button type="button" onClick={() => setGinv(true)}><InboxIcon size={15} /> Group invites</button>
        </div>
      ) : null}
      {rows && shown.length === 0 && !needle ? <EmptyState icon={MessageCircle} title={tab === 'unread' ? 'No unread chats' : tab === 'archived' ? 'No archived chats' : 'No conversations yet'} text={tab === 'unread' ? 'You are all caught up.' : tab === 'archived' ? 'Archived chats appear here.' : 'Tap New to message someone.'} /> : null}
      {shown.length > 0 ? (
        <section className="glass card">
          <div className="rows">
            {shown.map((c) => (
              <div className="conv" key={c.id} {...pressProps(() => { setMuteFor(null); setMenu(c.id); })}>
                <ConvRow c={c} meId={profile.id} />
                {menuX.value === c.id ? (
                  <div className={'conv-acts' + (menuX.out ? ' out' : '')}>
                    <button type="button" onClick={() => flag(c, { p_pinned: !c.pinned })}>{c.pinned ? <PinOff size={16} /> : <Pin size={16} />} {c.pinned ? 'Unpin' : 'Pin'}</button>
                    {c.muted ? (
                      <button type="button" onClick={() => mute(c, 'off')}><Bell size={16} /> Unmute</button>
                    ) : muteFor === c.id ? (
                      MUTE_OPTS.map((o) => <button type="button" key={o.t} onClick={() => mute(c, o.s)}><BellOff size={16} /> {o.t}</button>)
                    ) : (
                      <button type="button" onClick={() => setMuteFor(c.id)}><BellOff size={16} /> Mute...</button>
                    )}
                    <button type="button" onClick={() => flag(c, { p_archived: !c.archived })}>{c.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />} {c.archived ? 'Unarchive' : 'Archive'}</button>
                    <button type="button" onClick={() => { setMenu(null); setExpFor(c); }}><DownIcon size={16} /> Export chat</button>
                    {c.other.is_channel ? null : <button type="button" onClick={() => del(c)}><TrashIcon size={16} /> Delete chat</button>}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {needle.length >= 2 ? (
        <section className="glass card">
          <h3 className="sub-h">Messages</h3>
          {herr ? <div className="alert err with-action"><span>{herr}</span><button type="button" className="btn btn-secondary btn-sm" onClick={() => setRt((n) => n + 1)}><RefreshCw size={16} /> Retry</button></div> : null}
          {!hits && !herr ? <Skeleton rows={3} /> : null}
          {hits && hits.length === 0 ? <div className="empty"><p>No messages found.</p></div> : null}
          {hits && hits.length > 0 ? (
            <div className="rows">
              {hits.map((h) => {
                const c = (rows || []).find((x) => x.id === h.conversation_id);
                return (
                  <button type="button" className="row" key={h.id} onClick={() => nav('/messages/' + h.conversation_id, { state: { jump: h.id } })}>
                    {c ? <Avatar name={fullName(c.other)} url={c.other ? c.other.avatar_url : null} size={36} /> : null}
                    <div className="row-main"><b>{c ? fullName(c.other) : 'Conversation'}</b><span>{h.sender_name}: {h.body}</span><span>{dayLabel(h.created_at)} {clock(h.created_at)}</span></div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

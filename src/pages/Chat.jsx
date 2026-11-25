import { ask } from '../lib/dialog';
import { pressProps } from '../lib/longpress';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, CheckCheck, Clock, Copy, CornerUpLeft, Forward, Pencil, Pin, PinOff, RefreshCw, Search as SearchIcon, Send, Trash2, X, ListChecks, MessageSquare, Paperclip, Plus, Users } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import { useProfile } from '../lib/profile';
import ImageSend from '../components/ImageSend';
import { useSummary } from '../lib/summary';
import { listConversations, listMessages, sendMessage, editMessage, deleteMessage, deleteChannelMessage, getChannelPerms, markRead, toggleReaction, togglePin, listPins, votePoll, retractVote, closePoll, sendAttachment } from '../lib/api';
import { fullName, timeAgo } from '../lib/format';
import usePresence from '../lib/usePresence';
import { clock, dayKey, dayLabel, fullTime, minKey } from '../lib/chatTime';
import { rich, firstUrl } from '../lib/rich';
import { useTyping } from '../lib/typing';
import LinkCard from '../components/LinkCard';
import PinBar from '../components/PinBar';
import ChatSearch from '../components/ChatSearch';
import ForwardPicker from '../components/ForwardPicker';
import GroupInfoButton from '../components/GroupInfoButton';
import { Link as CallLink } from 'react-router-dom';
import { History, Phone } from 'lucide-react';
import { startCall } from '../lib/call';
import { useExitValue } from '../lib/useExit';
import Skeleton from '../components/ui/Skeleton';
import useNames from '../lib/useNames';
import { getChannelHead, getChatHead } from '../lib/api';
import LaterSheet from '../components/LaterSheet';
import PollSheet from '../components/PollSheet';
import PollCard from '../components/PollCard';
import ThreadPanel from '../components/ThreadPanel';
import AttachmentView from '../components/AttachmentView';
import { uploadChatFile, fileCategory, acceptList } from '../lib/files';
import { reserveUpload, releaseUpload } from '../lib/api';
import QuotaNote from '../components/QuotaNote';
import StagedFiles from '../components/StagedFiles';
import { draftOf, queueDraft, useDrafts } from '../lib/drafts';
import ReactorsSheet from '../components/ReactorsSheet';

const QUICK = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const norm = (m) => ({ ...m, deleted: m.deleted !== undefined ? m.deleted : Boolean(m.deleted_at), reactions: m.reactions || [] });

function merge(prev, fresh) {
  const ids = new Set(fresh.map((m) => m.id));
  const cids = new Set(fresh.map((m) => m.client_id).filter(Boolean));
  const oldest = fresh.length ? fresh[0].created_at : null;
  const older = prev.filter((m) => !m.local && !ids.has(m.id) && (!oldest || m.created_at < oldest));
  const local = prev.filter((m) => m.local && !cids.has(m.client_id));
  return [...older, ...fresh, ...local];
}

export default function Chat() {
  const { id } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const { profile } = useProfile();
  const { reload: reloadSummary, tick } = useSummary();
  const me = profile.id;
  const { typing, ping } = useTyping(id, me);
  const [other, setOther] = useState(null);
  const [msgs, setMsgs] = useState(null);
  const [more, setMore] = useState(null);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [sel, setSel] = useState(null);
  const selX = useExitValue(sel);
  useEffect(() => {
    if (!sel) return undefined;
    const off = (e) => { if (e.target.closest && e.target.closest('.acts')) return; setSel(null); };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [sel]);
  const [text, setText] = useState('');
  const [reply, setReply] = useState(null);
  const [editing, setEditing] = useState(null);
  const [pins, setPins] = useState([]);
  const [fwd, setFwd] = useState(null);
  const [later, setLater] = useState(null);
  const [searching, setSearching] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [thread, setThread] = useState(null);
  const [ups, setUps] = useState([]);
  const [staged, setStaged] = useState([]);
  const fileRef = useRef(null);
  const [qt, setQt] = useState(0);
  const seededFor = useRef(null);
  const { loaded: draftsLoaded, error: draftsError, version: draftsVersion } = useDrafts();
  const busyRef = useRef(false);
  const [rxFor, setRxFor] = useState(null);
  const [rxText, setRxText] = useState('');
  const [who, setWho] = useState(null);
  const saveDraft = (v) => {
    queueDraft(id, v);
  };
  const box = useRef(null);
  const root = useRef(null);
  const name = other ? fullName(other) : '';
  const names = useNames(id, !!(other && (other.is_group || other.is_channel)));
  const pr = usePresence(other && !other.is_group && !other.is_channel ? other.id : null);
  const isCh = !!(other && other.is_channel);
  const [cperm, setCperm] = useState(null);
  useEffect(() => {
    let live = true;
    if (isCh) getChannelPerms(id).then((r) => { if (live) setCperm(r.ok && r.data && r.data.can_delete ? r.data : null); });
    else setCperm(null);
    return () => { live = false; };
  }, [id, isCh]);
  const pline = !pr ? '' : pr.state === 'online' ? 'Online' : pr.state === 'dnd' ? 'Do not disturb' : pr.last_seen ? 'Last seen ' + timeAgo(pr.last_seen) : '';

  const loadOther = useCallback(async () => {
    const r = await listConversations();
    if (!r.ok) { setErr(r.error); return; }
    const c = (r.data || []).find((x) => x.id === id);
    if (c) setOther(c.other); else getChatHead(id).then((t) => { if (t.ok) setOther(t.data); else getChannelHead(id).then((u) => { if (u.ok) setOther(u.data); else setErr('Conversation not found.'); }); });
  }, [id]);
  const load = useCallback(async () => {
    const r = await listMessages(id);
    if (!r.ok) { setErr(r.error); return; }
    const fresh = (r.data || []).map(norm);
    setMsgs((p) => merge(p || [], fresh));
    setMore((m) => (m === null ? fresh.length >= 50 : m));
    setErr('');
  }, [id]);
  useEffect(() => { loadOther(); }, [loadOther]);
  useEffect(() => { load(); }, [load, tick]);
  useEffect(() => { listPins(id).then((r) => { if (r.ok) setPins(r.data || []); }); }, [id, tick]);
  useEffect(() => {
    setText('');
  }, [id]);
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(t);
  }, [notice]);
  useLayoutEffect(() => {
    const fit = () => {
      if (!root.current) return;
      const bn = document.querySelector('.bottom-nav');
      const bh = bn && getComputedStyle(bn).display !== 'none' ? bn.offsetHeight : 0;
      const top = root.current.getBoundingClientRect().top + window.scrollY;
      root.current.style.setProperty('--chat-h', Math.max(320, window.innerHeight - top - bh - 12) + 'px');
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const lastId = msgs && msgs.length ? msgs[msgs.length - 1].id : null;
  const lastIn = msgs ? [...msgs].reverse().find((m) => m.sender_id !== me && !m.local) : null;
  const lastInId = lastIn ? lastIn.id : null;
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [lastId]);
  useEffect(() => {
    if (!lastInId) return;
    markRead(id).then((r) => { if (r.ok) reloadSummary(); });
  }, [id, lastInId, reloadSummary]);

  const push = useCallback(async (m) => {
    const r = await sendMessage(id, m.body, m.client_id, m.reply_to);
    if (!r.ok) setNotice(r.error);
    setMsgs((p) => (p || []).map((x) => {
      if (!x.local || x.client_id !== m.client_id) return x;
      return r.ok ? { ...norm(r.data), reply: x.reply } : { ...x, pending: false, failed: true };
    }));
  }, [id]);
  const submit = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try { await doSubmit(); } finally { busyRef.current = false; }
  };
  const doSubmit = async () => {
    const body = text.trim();
    if (!body) return;
    if (editing) {
      const r = await editMessage(editing.id, body);
      if (r.ok) {
        setMsgs((p) => p.map((x) => (x.id === editing.id ? { ...x, body: r.data.body, edited_at: r.data.edited_at } : x)));
        setEditing(null); setText('');
      } else setNotice(r.error);
      return;
    }
    const cid = crypto.randomUUID();
    const m = {
      id: 'tmp-' + cid, client_id: cid, conversation_id: id, sender_id: me, body, reply_to: reply ? reply.id : null,
      reply: reply ? { id: reply.id, sender_id: reply.sender_id, deleted: false, body: reply.body.slice(0, 140) } : null,
      created_at: new Date().toISOString(), reactions: [], deleted: false, local: true, pending: true,
    };
    setMsgs((p) => [...(p || []), m]);
    setText(''); setReply(null); saveDraft('');
    push(m);
  };
  const retry = (m) => {
    setMsgs((p) => p.map((x) => (x.local && x.client_id === m.client_id ? { ...x, pending: true, failed: false } : x)));
    push(m);
  };
  const discard = (m) => setMsgs((p) => p.filter((x) => !(x.local && x.client_id === m.client_id)));
  const startEdit = (m) => { setEditing(m); setText(m.body); setReply(null); setSel(null); };
  const del = async (m) => {
    setSel(null);
    if (!await ask('Delete this message?')) return;
    const r = await (cperm ? deleteChannelMessage(m.id) : deleteMessage(m.id));
    if (r.ok) setMsgs((p) => p.map((x) => (x.id === m.id ? { ...x, deleted: true, body: '', reactions: [] } : x)));
    else setNotice(r.error);
  };
  const react = async (m, e) => {
    setSel(null);
    const r = await toggleReaction(m.id, e);
    if (r.ok) load(); else setNotice(r.error);
  };
  const copy = async (m) => {
    setSel(null);
    try { await navigator.clipboard.writeText(m.body); setNotice('Copied'); } catch (e) { setNotice('Could not copy.'); }
  };
  const jump = (mid) => {
    const el = document.getElementById('m-' + mid);
    if (!el) { setNotice('Load earlier messages to jump to it.'); return false; }
    el.scrollIntoView({ block: 'center' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1500);
    return true;
  };
  const goQuote = async (mid) => {
    const has = (l) => l.some((x) => x.id === mid);
    if (!has(msgs || [])) {
      let acc = [];
      let before = ((msgs || []).find((x) => !x.local) || {}).created_at;
      let more2 = true;
      let guard = 0;
      while (before && more2 && guard < 20 && !has(acc)) {
        const r = await listMessages(id, before, 100);
        if (!r.ok) { setNotice(r.error); return; }
        const old = (r.data || []).map(norm);
        if (!old.length) { more2 = false; break; }
        acc = [...old, ...acc];
        before = old[0].created_at;
        more2 = old.length >= 100;
        guard += 1;
      }
      if (!has(acc)) { setNotice('Original message is not available.'); return; }
      setMsgs((p) => { const ids = new Set(p.map((x) => x.id)); return [...acc.filter((x) => !ids.has(x.id)), ...p]; });
      setMore(more2);
    }
    setTimeout(() => jump(mid), 80);
  };
  useEffect(() => {
    const j = loc.state && loc.state.jump;
    if (!j || !msgs) return;
    nav(loc.pathname, { replace: true, state: null });
    goQuote(j);
  }, [msgs, loc.state]);
  useEffect(() => {
    if (!draftsLoaded) return;
    const remote = draftOf(id);
    if (seededFor.current !== id) { seededFor.current = id; setText(remote); return; }
    const ae = document.activeElement;
    const focused = Boolean(ae && ae.getAttribute && ae.getAttribute('aria-label') === 'Message');
    if (!editing && !focused && remote !== text) setText(remote);
  }, [id, draftsLoaded, draftsVersion]);
  useEffect(() => { if (draftsError) setNotice(draftsError); }, [draftsError]);
  const addRx = (m) => {
    const v = rxText.trim();
    if (!v || [...v].length > 16 || !/\p{Extended_Pictographic}/u.test(v)) { setNotice('Enter an emoji.'); return; }
    setRxFor(null); setRxText('');
    react(m, v);
  };
  const pin = async (m) => {
    setSel(null);
    const r = await togglePin(m.id);
    if (!r.ok) { setNotice(r.error); return; }
    const p = await listPins(id);
    if (p.ok) setPins(p.data || []);
    load();
  };
  const earlier = async () => {
    const first = msgs.find((m) => !m.local);
    if (!first) return;
    const r = await listMessages(id, first.created_at, 50);
    if (!r.ok) { setErr(r.error); return; }
    const old = (r.data || []).map(norm);
    setMsgs((p) => [...old, ...p]);
    setMore(old.length >= 50);
  };

  const vote = async (p, oid) => {
    const r = await votePoll(p.id, oid);
    if (r.ok) load(); else setNotice(r.error);
  };
  const retract = async (p) => {
    const r = await retractVote(p.id);
    if (r.ok) load(); else setNotice(r.error);
  };
  const closeP = async (p) => {
    if (!await ask('Close this poll? Voting will stop.')) return;
    const r = await closePoll(p.id);
    if (r.ok) load(); else setNotice(r.error);
  };
  const runUpload = useCallback(async (u) => {
    const set = (patch) => setUps((p) => p.map((x) => (x.key === u.key ? { ...x, ...patch } : x)));
    set({ failed: false, error: '' });
    let path = u.path;
    if (!path) {
      set({ progress: 0 });
      const rs = await reserveUpload(id, u.file.name, u.file.type, u.file.size);
      if (!rs.ok) { set({ failed: true, error: rs.error }); return; }
      const r = await uploadChatFile(rs.data.path, u.file, (n) => set({ progress: n }));
      if (!r.ok) { await releaseUpload(rs.data.id); set({ failed: true, error: r.error }); return; }
      path = rs.data.path;
      set({ path, progress: 100, rid: rs.data.id });
    }
    const s = await sendAttachment(id, path, u.file.name, u.file.type, u.file.size, u.key);
    if (!s.ok) { set({ failed: true, error: s.error }); return; }
    setQt((n) => n + 1);
    setUps((p) => p.filter((x) => x.key !== u.key));
    load();
  }, [id, load]);
  const onFiles = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const f of files) {
      if (f.size < 1) { setNotice(f.name + ' is empty.'); continue; }
      if (!fileCategory(f)) { setNotice(f.name + ' is not allowed. Images and documents only.'); continue; }
      setStaged((p) => [...p, { key: crypto.randomUUID(), file: f, url: f.type.indexOf('image/') === 0 ? URL.createObjectURL(f) : null }]);
    }
  };

  const stagedRef = useRef([]);
  stagedRef.current = staged;
  useEffect(() => () => {
    stagedRef.current.forEach((s) => { if (s.url) URL.revokeObjectURL(s.url); });
    setStaged([]);
  }, [id]);
  const dropStaged = (key) => setStaged((p) => {
    const x = p.find((s) => s.key === key);
    if (x && x.url) URL.revokeObjectURL(x.url);
    return p.filter((s) => s.key !== key);
  });
  const sendStaged = () => {
    const list = staged;
    setStaged([]);
    list.forEach((s) => {
      if (s.url) URL.revokeObjectURL(s.url);
      const u = { key: s.key, file: s.file, progress: 0, failed: false, error: '', path: null };
      setUps((p) => [...p, u]);
      runUpload(u);
    });
  };
  const statusTick = (m) => {
    if (m.pending) return <Clock size={12} className="tick" aria-label="Sending" />;
    if (m.failed) return null;
    const s = m.status || 'sent';
    if (s === 'read') return <CheckCheck size={14} className="tick read" aria-label="Read" />;
    if (s === 'delivered') return <CheckCheck size={14} className="tick" aria-label="Delivered" />;
    return <Check size={14} className="tick" aria-label="Sent" />;
  };
  const bubble = (m, showTime) => {
    const mine = m.sender_id === me;
    return (
      <div key={m.id} id={'m-' + m.id} className={'msg' + (mine ? ' mine' : '')}>
        <button type="button" className={'bubble' + (m.deleted ? ' gone' : '') + (m.failed ? ' failed' : '')} aria-expanded={sel === m.id}
          {...pressProps(() => { if (!m.local && !m.deleted) setSel(m.id); })}>
          {!mine && names[m.sender_id] ? <span className="sname">{names[m.sender_id]}</span> : null}
          {m.forwarded ? <span className="fwd"><Forward size={12} /> {m.forwarded_from_name ? 'Forwarded from ' + m.forwarded_from_name : 'Forwarded'}</span> : null}
          {m.reply ? <span className="quote" role="button" tabIndex={0} aria-label="Go to original message" onClick={(e) => { e.stopPropagation(); goQuote(m.reply.id); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); goQuote(m.reply.id); } }}><b>{m.reply.sender_id === me ? 'You' : (names[m.reply.sender_id] || name)}</b>{m.reply.deleted ? 'Message deleted' : m.reply.body}</span> : null}
          {m.deleted ? <i>Message deleted</i> : (m.attachments && m.attachments.length && m.attachments[0].name === m.body ? null : <span className="mbody">{rich(m.body)}</span>)}
          {showTime || m.edited_at || m.pending ? <span className="meta" title={fullTime(m.created_at)}>{m.edited_at ? 'edited ' : ''}{clock(m.created_at)}{mine && !m.deleted ? statusTick(m) : null}</span> : null}
        </button>
        {!m.deleted && firstUrl(m.body) ? <LinkCard url={firstUrl(m.body)} /> : null}
        {!m.deleted && m.poll ? <PollCard poll={m.poll} onVote={(oid) => vote(m.poll, oid)} onRetract={() => retract(m.poll)} onClose={() => closeP(m.poll)} /> : null}
        {!m.deleted && m.attachments && m.attachments.length ? m.attachments.map((a) => <AttachmentView key={a.id} a={a} />) : null}
        {!m.deleted && m.thread_count > 0 ? <button type="button" className="thread-link" onClick={() => setThread(m)}><MessageSquare size={14} /> {m.thread_count} {m.thread_count === 1 ? 'reply' : 'replies'}</button> : null}
        {m.failed ? (
          <span className="fail">Not sent.
            <button type="button" onClick={() => retry(m)}><RefreshCw size={14} /> Retry</button>
            <button type="button" onClick={() => discard(m)}><X size={14} /> Discard</button>
          </span>
        ) : null}
        {m.reactions.length ? (
          <div className="rxs">{m.reactions.map((r) => <button type="button" key={r.emoji} className={'rx' + (r.mine ? ' mine' : '')} onClick={() => react(m, r.emoji)}>{r.emoji} {r.count}</button>)}</div>
        ) : null}
        {selX.value === m.id ? (
          <div className={'acts' + (selX.out ? ' out' : '')} role="menu">
            <div className="when">{fullTime(m.created_at)}</div>
            <div className="quick">{QUICK.map((e) => <button type="button" key={e} aria-label={'React ' + e} onClick={() => react(m, e)}>{e}</button>)}<button type="button" aria-label="More reactions" onClick={() => { setRxFor(m.id); setRxText(''); }}><Plus size={18} /></button></div>
            {rxFor === m.id ? (
              <div className="rx-in">
                <input autoFocus value={rxText} maxLength={16} aria-label="Emoji reaction" placeholder="Type or paste an emoji" onChange={(e) => setRxText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRx(m); } }} />
                <button type="button" onClick={() => addRx(m)}>Add</button>
              </div>
            ) : null}
            <button type="button" onClick={() => { setReply(m); setEditing(null); setSel(null); }}><CornerUpLeft size={16} /> Reply</button>
            <button type="button" onClick={() => copy(m)}><Copy size={16} /> Copy</button>
            {m.reactions.length ? <button type="button" onClick={() => { setWho(m); setSel(null); }}><Users size={16} /> Reactions</button> : null}
            <button type="button" onClick={() => { setThread(m); setSel(null); }}><MessageSquare size={16} /> Reply in thread</button>
            <button type="button" onClick={() => { setFwd(m); setSel(null); }}><Forward size={16} /> Forward</button>
            <button type="button" onClick={() => pin(m)}>{m.pinned ? <PinOff size={16} /> : <Pin size={16} />} {m.pinned ? 'Unpin' : 'Pin'}</button>
            <button type="button" onClick={() => { setLater({ tab: 'remind', message: m }); setSel(null); }}><Clock size={16} /> Remind me</button>
            {mine && !m.edited_at ? <button type="button" onClick={() => startEdit(m)}><Pencil size={16} /> Edit</button> : null}
            {mine || cperm ? <button type="button" onClick={() => del(m)}><Trash2 size={16} /> Delete</button> : null}
          </div>
        ) : null}
      </div>
    );
  };

  const items = [];
  let prevDay = '';
  const list = msgs || [];
  for (let i = 0; i < list.length; i += 1) {
    const m = list[i];
    const nx = list[i + 1];
    const k = dayKey(m.created_at);
    if (k !== prevDay) { items.push(<div className="day-sep" key={'d' + k}><span>{dayLabel(m.created_at)}</span></div>); prevDay = k; }
    items.push(bubble(m, !nx || nx.sender_id !== m.sender_id || minKey(nx.created_at) !== minKey(m.created_at)));
  }

  return (
    <div className="glass chat" ref={root}>
      <div className="chat-head">
        <button type="button" className="icon-btn" aria-label="Back to messages" onClick={() => nav('/messages')}><ArrowLeft size={20} /></button>
        {other ? <Avatar name={name} url={other.avatar_url} size={40} /> : <span className="avatar" style={{ width: 40, height: 40, background: '#e2e8f0' }} />}
        <b>{name}{typing ? <small className="typing">typing...</small> : pline ? <small className="pline">{pline}</small> : null}</b>
        <button type="button" className="icon-btn" aria-label="Search in chat" onClick={() => setSearching(!searching)}><SearchIcon size={20} /></button>
        {other && !other.is_group && !other.is_channel ? <><CallLink className="icon-btn" to="/calls" aria-label="Call history"><History size={20} /></CallLink><button type="button" className="icon-btn" aria-label={'Voice call ' + name} onClick={() => startCall(id, name)}><Phone size={20} /></button></> : null}
        {other && (other.is_group || other.is_channel) ? <GroupInfoButton id={id} other={other} /> : null}
      </div>
      {searching ? <ChatSearch conversationId={id} onClose={() => setSearching(false)} onJump={(m) => { setSearching(false); goQuote(m.id); }} /> : null}
      {pins.length ? <PinBar pins={pins} onJump={jump} /> : null}
      <p className="purge-note"><Clock size={12} /> Messages are deleted after 7 days</p>
      <div className="chat-box" ref={box}>
        {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={() => { loadOther(); load(); }}><RefreshCw size={16} /> Retry</button></div> : null}
        {notice ? <div className="alert info">{notice}</div> : null}
        {more === true ? <button type="button" className="btn btn-secondary btn-sm more" onClick={earlier}>Load earlier messages</button> : null}
        {!msgs && !err ? <div className="sk-chat" aria-busy="true" aria-label="Loading"><span className="sk sk-bub" /><span className="sk sk-bub me" /><span className="sk sk-bub" /><span className="sk sk-bub me" /></div> : null}
        {msgs && msgs.length === 0 ? <div className="empty"><p>No messages yet. Say hello.</p></div> : null}
        {items}
      </div>
      {pollOpen ? <PollSheet conversationId={id} onClose={() => setPollOpen(false)} onDone={() => { setPollOpen(false); setNotice('Poll sent'); load(); }} /> : null}
      {thread ? <ThreadPanel root={thread} me={me} name={name} onClose={() => setThread(null)} /> : null}
      {who ? <ReactorsSheet message={who} onClose={() => setWho(null)} /> : null}
      {fwd ? <ForwardPicker message={fwd} onClose={() => setFwd(null)} onDone={(c) => { setFwd(null); setNotice('Forwarded to ' + fullName(c.other)); }} /> : null}
      {later ? (
        <LaterSheet conversationId={id} {...later} onClose={() => setLater(null)}
          onDone={(kind) => {
            if (kind === 'schedule' && later.text && later.text === text) { setText(''); saveDraft(''); }
            setLater(null);
            setNotice(kind === 'schedule' ? 'Message scheduled' : 'Reminder set');
          }} />
      ) : null}
      <QuotaNote tick={qt} />
      <StagedFiles items={staged} onRemove={dropStaged} onSend={sendStaged} />
      {ups.length ? (
        <div className="ups">
          {ups.map((u) => (
            <div className="up" key={u.key}>
              <Paperclip size={16} /><span className="up-name">{u.file.name}</span>
              {u.failed ? (
                <>
                  <span className="up-err">{u.error}</span>
                  <button type="button" onClick={() => runUpload(u)}><RefreshCw size={14} /> Retry</button>
                  <button type="button" onClick={() => setUps((p) => p.filter((x) => x.key !== u.key))}><X size={14} /> Discard</button>
                </>
              ) : <span className="up-bar"><i style={{ width: u.progress + '%' }} /></span>}
            </div>
          ))}
        </div>
      ) : null}
      <div className="composer">
        {reply ? <div className="ctx"><CornerUpLeft size={16} /><span><b>Replying to {reply.sender_id === me ? 'yourself' : name}</b>{reply.body}</span><button type="button" aria-label="Cancel reply" onClick={() => setReply(null)}><X size={16} /></button></div> : null}
        {editing ? <div className="ctx"><Pencil size={16} /><span><b>Editing message</b>A message can be edited once.</span><button type="button" aria-label="Cancel edit" onClick={() => { setEditing(null); setText(''); }}><X size={16} /></button></div> : null}
        <div className="cmp">
          <textarea rows={1} value={text} placeholder="Message" aria-label="Message" maxLength={4000} disabled={!msgs}
            onChange={(e) => { setText(e.target.value); if (!editing) saveDraft(e.target.value); ping(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
          <input ref={fileRef} type="file" multiple hidden accept={acceptList()} onChange={onFiles} />
          <button type="button" className="icon-btn" aria-label="Attach file" disabled={!msgs} onClick={() => fileRef.current && fileRef.current.click()}><Paperclip size={20} /></button>
          <ImageSend conversationId={id} disabled={!msgs} onSent={() => load()} onNotice={setNotice} />
          <button type="button" className="icon-btn" aria-label="New poll" disabled={!msgs} onClick={() => setPollOpen(true)}><ListChecks size={20} /></button>
          <button type="button" className="icon-btn" aria-label="Schedule or remind" onClick={() => setLater({ tab: 'schedule', text })}><Clock size={20} /></button>
          <button type="button" className="send" aria-label={editing ? 'Save edit' : 'Send'} disabled={!text.trim() || !msgs} onClick={submit}><Send size={20} /></button>
        </div>
      </div>
    </div>
  );
}

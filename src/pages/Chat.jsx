import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Copy, CornerUpLeft, Forward, Pencil, Pin, PinOff, RefreshCw, Search as SearchIcon, Send, Trash2, X, ListChecks, MessageSquare, Paperclip } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import { useProfile } from '../lib/profile';
import { useSummary } from '../lib/summary';
import { listConversations, listMessages, sendMessage, editMessage, deleteMessage, markRead, toggleReaction, togglePin, listPins, votePoll, closePoll, sendAttachment } from '../lib/api';
import { fullName, timeAgo } from '../lib/format';
import usePresence from '../lib/usePresence';
import { clock, dayKey, dayLabel } from '../lib/chatTime';
import { rich, firstUrl } from '../lib/rich';
import { useTyping } from '../lib/typing';
import LinkCard from '../components/LinkCard';
import PinBar from '../components/PinBar';
import ChatSearch from '../components/ChatSearch';
import ForwardPicker from '../components/ForwardPicker';
import GroupInfoButton from '../components/GroupInfoButton';
import useNames from '../lib/useNames';
import { getChannelHead } from '../lib/api';
import LaterSheet from '../components/LaterSheet';
import PollSheet from '../components/PollSheet';
import PollCard from '../components/PollCard';
import ThreadPanel from '../components/ThreadPanel';
import AttachmentView from '../components/AttachmentView';
import { MAX_FILE, uploadChatFile } from '../lib/files';

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
  const fileRef = useRef(null);
  const saveDraft = (v) => {
    try { if (v) localStorage.setItem('xentra-draft-' + id, v); else localStorage.removeItem('xentra-draft-' + id); } catch (e) { /* storage blocked */ }
  };
  const box = useRef(null);
  const root = useRef(null);
  const name = other ? fullName(other) : 'Conversation';
  const names = useNames(id, !!(other && (other.is_group || other.is_channel)));
  const pr = usePresence(other && !other.is_group && !other.is_channel ? other.id : null);
  const pline = !pr ? '' : pr.state === 'online' ? 'Online' : pr.state === 'dnd' ? 'Do not disturb' : pr.last_seen ? 'Last seen ' + timeAgo(pr.last_seen) : '';

  const loadOther = useCallback(async () => {
    const r = await listConversations();
    if (!r.ok) { setErr(r.error); return; }
    const c = (r.data || []).find((x) => x.id === id);
    if (c) setOther(c.other); else getChannelHead(id).then((t) => { if (t.ok) setOther(t.data); else setErr('Conversation not found.'); });
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
    try { setText(localStorage.getItem('xentra-draft-' + id) || ''); } catch (e) { setText(''); }
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
    if (!window.confirm('Delete this message?')) return;
    const r = await deleteMessage(m.id);
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
  const closeP = async (p) => {
    if (!window.confirm('Close this poll? Voting will stop.')) return;
    const r = await closePoll(p.id);
    if (r.ok) load(); else setNotice(r.error);
  };
  const runUpload = useCallback(async (u) => {
    const set = (patch) => setUps((p) => p.map((x) => (x.key === u.key ? { ...x, ...patch } : x)));
    set({ failed: false, error: '' });
    let path = u.path;
    if (!path) {
      set({ progress: 0 });
      const r = await uploadChatFile(id, u.file, (n) => set({ progress: n }));
      if (!r.ok) { set({ failed: true, error: r.error }); return; }
      path = r.path;
      set({ path, progress: 100 });
    }
    const s = await sendAttachment(id, path, u.file.name, u.file.type, u.file.size, u.key);
    if (!s.ok) { set({ failed: true, error: s.error }); return; }
    setUps((p) => p.filter((x) => x.key !== u.key));
    load();
  }, [id, load]);
  const onFiles = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const f of files) {
      if (f.size < 1) { setNotice(f.name + ' is empty.'); continue; }
      if (f.size > MAX_FILE) { setNotice(f.name + ' is over 25 MB.'); continue; }
      const u = { key: crypto.randomUUID(), file: f, progress: 0, failed: false, error: '', path: null };
      setUps((p) => [...p, u]);
      runUpload(u);
    }
  };

  const bubble = (m) => {
    const mine = m.sender_id === me;
    return (
      <div key={m.id} id={'m-' + m.id} className={'msg' + (mine ? ' mine' : '')}>
        <button type="button" className={'bubble' + (m.deleted ? ' gone' : '') + (m.failed ? ' failed' : '')} aria-expanded={sel === m.id}
          onClick={() => { if (!m.local && !m.deleted) setSel(sel === m.id ? null : m.id); }}>
          {!mine && names[m.sender_id] ? <span className="sname">{names[m.sender_id]}</span> : null}
          {m.forwarded ? <span className="fwd"><Forward size={12} /> Forwarded</span> : null}
          {m.reply ? <span className="quote"><b>{m.reply.sender_id === me ? 'You' : name}</b>{m.reply.deleted ? 'Message deleted' : m.reply.body}</span> : null}
          {m.deleted ? <i>Message deleted</i> : (m.attachments && m.attachments.length && m.attachments[0].name === m.body ? null : <span className="mbody">{rich(m.body)}</span>)}
          <span className="meta">{m.edited_at ? 'edited ' : ''}{clock(m.created_at)}{m.pending ? ' - sending' : ''}</span>
        </button>
        {!m.deleted && firstUrl(m.body) ? <LinkCard url={firstUrl(m.body)} /> : null}
        {!m.deleted && m.poll ? <PollCard poll={m.poll} onVote={(oid) => vote(m.poll, oid)} onClose={() => closeP(m.poll)} /> : null}
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
        {sel === m.id ? (
          <div className="acts" role="menu">
            <div className="quick">{QUICK.map((e) => <button type="button" key={e} aria-label={'React ' + e} onClick={() => react(m, e)}>{e}</button>)}</div>
            <button type="button" onClick={() => { setReply(m); setEditing(null); setSel(null); }}><CornerUpLeft size={16} /> Reply</button>
            <button type="button" onClick={() => copy(m)}><Copy size={16} /> Copy</button>
            <button type="button" onClick={() => { setThread(m); setSel(null); }}><MessageSquare size={16} /> Reply in thread</button>
            <button type="button" onClick={() => { setFwd(m); setSel(null); }}><Forward size={16} /> Forward</button>
            <button type="button" onClick={() => pin(m)}>{m.pinned ? <PinOff size={16} /> : <Pin size={16} />} {m.pinned ? 'Unpin' : 'Pin'}</button>
            <button type="button" onClick={() => { setLater({ tab: 'remind', message: m }); setSel(null); }}><Clock size={16} /> Remind me</button>
            {mine && !m.edited_at ? <button type="button" onClick={() => startEdit(m)}><Pencil size={16} /> Edit</button> : null}
            {mine ? <button type="button" onClick={() => del(m)}><Trash2 size={16} /> Delete</button> : null}
          </div>
        ) : null}
      </div>
    );
  };

  const items = [];
  let prevDay = '';
  for (const m of msgs || []) {
    const k = dayKey(m.created_at);
    if (k !== prevDay) { items.push(<div className="day-sep" key={'d' + k}><span>{dayLabel(m.created_at)}</span></div>); prevDay = k; }
    items.push(bubble(m));
  }

  return (
    <div className="glass chat" ref={root}>
      <div className="chat-head">
        <button type="button" className="icon-btn" aria-label="Back to messages" onClick={() => nav('/messages')}><ArrowLeft size={20} /></button>
        <Avatar name={name} url={other ? other.avatar_url : null} size={40} />
        <b>{name}{typing ? <small className="typing">typing...</small> : pline ? <small className="pline">{pline}</small> : null}</b>
        <button type="button" className="icon-btn" aria-label="Search in chat" onClick={() => setSearching(!searching)}><SearchIcon size={20} /></button>
        {other && (other.is_group || other.is_channel) ? <GroupInfoButton id={id} other={other} /> : null}
      </div>
      {searching ? <ChatSearch conversationId={id} onClose={() => setSearching(false)} onJump={(m) => { if (jump(m.id)) setSearching(false); }} /> : null}
      {pins.length ? <PinBar pins={pins} onJump={jump} /> : null}
      <div className="chat-box" ref={box}>
        {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={() => { loadOther(); load(); }}><RefreshCw size={16} /> Retry</button></div> : null}
        {notice ? <div className="alert info">{notice}</div> : null}
        {more === true ? <button type="button" className="btn btn-secondary btn-sm more" onClick={earlier}>Load earlier messages</button> : null}
        {!msgs && !err ? <div className="empty"><p>Loading...</p></div> : null}
        {msgs && msgs.length === 0 ? <div className="empty"><p>No messages yet. Say hello.</p></div> : null}
        {items}
      </div>
      {pollOpen ? <PollSheet conversationId={id} onClose={() => setPollOpen(false)} onDone={() => { setPollOpen(false); setNotice('Poll sent'); load(); }} /> : null}
      {thread ? <ThreadPanel root={thread} me={me} name={name} onClose={() => setThread(null)} /> : null}
      {fwd ? <ForwardPicker message={fwd} onClose={() => setFwd(null)} onDone={(c) => { setFwd(null); setNotice('Forwarded to ' + fullName(c.other)); }} /> : null}
      {later ? (
        <LaterSheet conversationId={id} {...later} onClose={() => setLater(null)}
          onDone={(kind) => {
            if (kind === 'schedule' && later.text && later.text === text) { setText(''); saveDraft(''); }
            setLater(null);
            setNotice(kind === 'schedule' ? 'Message scheduled' : 'Reminder set');
          }} />
      ) : null}
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
          <input ref={fileRef} type="file" multiple hidden onChange={onFiles} />
          <button type="button" className="icon-btn" aria-label="Attach file" disabled={!msgs} onClick={() => fileRef.current && fileRef.current.click()}><Paperclip size={20} /></button>
          <button type="button" className="icon-btn" aria-label="New poll" disabled={!msgs} onClick={() => setPollOpen(true)}><ListChecks size={20} /></button>
          <button type="button" className="icon-btn" aria-label="Schedule or remind" onClick={() => setLater({ tab: 'schedule', text })}><Clock size={20} /></button>
          <button type="button" className="send" aria-label={editing ? 'Save edit' : 'Send'} disabled={!text.trim() || !msgs} onClick={submit}><Send size={20} /></button>
        </div>
      </div>
    </div>
  );
}

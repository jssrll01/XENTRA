import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, CornerUpLeft, Pencil, RefreshCw, Send, Trash2, X } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import { useProfile } from '../lib/profile';
import { useSummary } from '../lib/summary';
import { listConversations, listMessages, sendMessage, editMessage, deleteMessage, markRead, toggleReaction } from '../lib/api';
import { fullName } from '../lib/format';
import { clock, dayKey, dayLabel } from '../lib/chatTime';

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
  const [other, setOther] = useState(null);
  const [msgs, setMsgs] = useState(null);
  const [more, setMore] = useState(null);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [sel, setSel] = useState(null);
  const [text, setText] = useState('');
  const [reply, setReply] = useState(null);
  const [editing, setEditing] = useState(null);
  const box = useRef(null);
  const root = useRef(null);
  const name = other ? fullName(other) : 'Conversation';

  const loadOther = useCallback(async () => {
    const r = await listConversations();
    if (!r.ok) { setErr(r.error); return; }
    const c = (r.data || []).find((x) => x.id === id);
    if (c) setOther(c.other); else setErr('Conversation not found.');
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
    setText(''); setReply(null);
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
  const earlier = async () => {
    const first = msgs.find((m) => !m.local);
    if (!first) return;
    const r = await listMessages(id, first.created_at, 50);
    if (!r.ok) { setErr(r.error); return; }
    const old = (r.data || []).map(norm);
    setMsgs((p) => [...old, ...p]);
    setMore(old.length >= 50);
  };

  const bubble = (m) => {
    const mine = m.sender_id === me;
    return (
      <div key={m.id} className={'msg' + (mine ? ' mine' : '')}>
        <button type="button" className={'bubble' + (m.deleted ? ' gone' : '') + (m.failed ? ' failed' : '')} aria-expanded={sel === m.id}
          onClick={() => { if (!m.local && !m.deleted) setSel(sel === m.id ? null : m.id); }}>
          {m.reply ? <span className="quote"><b>{m.reply.sender_id === me ? 'You' : name}</b>{m.reply.deleted ? 'Message deleted' : m.reply.body}</span> : null}
          {m.deleted ? <i>Message deleted</i> : <span className="mbody">{m.body}</span>}
          <span className="meta">{m.edited_at ? 'edited ' : ''}{clock(m.created_at)}{m.pending ? ' - sending' : ''}</span>
        </button>
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
        <b>{name}</b>
      </div>
      <div className="chat-box" ref={box}>
        {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={() => { loadOther(); load(); }}><RefreshCw size={16} /> Retry</button></div> : null}
        {notice ? <div className="alert info">{notice}</div> : null}
        {more === true ? <button type="button" className="btn btn-secondary btn-sm more" onClick={earlier}>Load earlier messages</button> : null}
        {!msgs && !err ? <div className="empty"><p>Loading...</p></div> : null}
        {msgs && msgs.length === 0 ? <div className="empty"><p>No messages yet. Say hello.</p></div> : null}
        {items}
      </div>
      <div className="composer">
        {reply ? <div className="ctx"><CornerUpLeft size={16} /><span><b>Replying to {reply.sender_id === me ? 'yourself' : name}</b>{reply.body}</span><button type="button" aria-label="Cancel reply" onClick={() => setReply(null)}><X size={16} /></button></div> : null}
        {editing ? <div className="ctx"><Pencil size={16} /><span><b>Editing message</b>A message can be edited once.</span><button type="button" aria-label="Cancel edit" onClick={() => { setEditing(null); setText(''); }}><X size={16} /></button></div> : null}
        <div className="cmp">
          <textarea rows={1} value={text} placeholder="Message" aria-label="Message" maxLength={4000} disabled={!msgs}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
          <button type="button" className="send" aria-label={editing ? 'Save edit' : 'Send'} disabled={!text.trim() || !msgs} onClick={submit}><Send size={20} /></button>
        </div>
      </div>
    </div>
  );
}

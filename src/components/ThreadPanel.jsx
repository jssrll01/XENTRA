import React, { useCallback, useEffect, useRef, useState } from 'react';
import Skeleton from './ui/Skeleton';
import { RefreshCw, Send } from 'lucide-react';
import Sheet from './Sheet';
import { listThread, sendThreadReply } from '../lib/api';
import { useSummary } from '../lib/summary';
import { clock } from '../lib/chatTime';

export default function ThreadPanel({ root, me, name, onClose }) {
  const { tick } = useSummary();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  const load = useCallback(async () => {
    const r = await listThread(root.id);
    if (r.ok) { setData(r.data); setErr(''); } else setErr(r.error);
  }, [root.id]);
  useEffect(() => { load(); }, [load, tick]);
  const count = data ? data.replies.length : 0;
  useEffect(() => { if (end.current) end.current.scrollTop = end.current.scrollHeight; }, [count]);
  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    const r = await sendThreadReply(root.id, body, crypto.randomUUID());
    setBusy(false);
    if (r.ok) { setText(''); setErr(''); load(); } else setErr(r.error);
  };
  return (
    <Sheet title="Thread" onClose={onClose}>
      <div className="th-root">{root.body}</div>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      <div className="th-list" ref={end}>
        {!data && !err ? <Skeleton /> : null}
        {data && data.replies.length === 0 ? <div className="empty"><p>No replies yet.</p></div> : null}
        {data ? data.replies.map((x) => (
          <div key={x.id} className={'th-msg' + (x.sender_id === me ? ' mine' : '')}>
            {x.deleted ? <i>Message deleted</i> : x.body}
            <small>{x.sender_id === me ? 'You' : name} - {clock(x.created_at)}</small>
          </div>
        )) : null}
      </div>
      <div className="th-cmp">
        <input type="text" placeholder="Reply in thread" aria-label="Reply in thread" maxLength={4000} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }} />
        <button type="button" className="send" aria-label="Send reply" disabled={!text.trim() || busy} onClick={send}><Send size={20} /></button>
      </div>
    </Sheet>
  );
}

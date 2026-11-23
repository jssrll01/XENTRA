import React, { useCallback, useEffect, useState } from 'react';
import Skeleton from './ui/Skeleton';
import { Link } from 'react-router-dom';
import { Hash, Lock, Pencil, Pin, PinOff, RefreshCw, Trash2 } from 'lucide-react';
import { listChannels, listPosts, createPost, pinPost, deletePost, editPost } from '../lib/api';
import { timeAgo } from '../lib/format';

export default function TeamHome({ team, tick }) {
  const staff = team.my_role !== 'member';
  const [ch, setCh] = useState(null);
  const [posts, setPosts] = useState(null);
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [ed, setEd] = useState(null);
  const [edText, setEdText] = useState('');
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([listChannels(team.id), listPosts(team.id)]);
    if (!a.ok) { setErr(a.error); return; }
    if (!b.ok) { setErr(b.error); return; }
    setCh(a.data || []); setPosts(b.data || []); setErr('');
  }, [team.id]);
  useEffect(() => { load(); }, [load, tick]);
  const run = async (p) => {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (r.ok) { load(); return true; }
    setErr(r.error);
    return false;
  };
  const post = async () => { if (await run(createPost(team.id, text))) setText(''); };
  const saveEdit = async () => { if (await run(editPost(ed, edText))) setEd(null); };
  return (
    <>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {!ch && !err ? <Skeleton /> : null}
      {ch ? (
        <section className="glass card">
          <div className="card-head"><h2>Channels</h2></div>
          <div className="rows">
            {ch.map((c) => (
              <Link className="row" key={c.id} to={'/messages/' + c.id}>
                {c.mods_only ? <Lock size={18} /> : <Hash size={18} />}
                <div className="row-main"><b>{c.name}</b>{c.archived ? <span>Archived</span> : c.mods_only ? <span>Moderators post</span> : null}</div>
                {c.unread > 0 ? <span className="badge">{c.unread > 99 ? '99+' : c.unread}</span> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      {posts ? (
        <section className="glass card">
          <div className="card-head"><h2>Posts</h2></div>
          {staff && !team.muted ? (
            <div className="lbl-row">
              <input type="text" placeholder="Share a post" aria-label="Share a post" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
              <button type="button" className="btn btn-primary btn-sm" disabled={busy || !text.trim()} onClick={post}>Post</button>
            </div>
          ) : null}
          {posts.length === 0 ? <p className="note">No posts yet.</p> : null}
          <div className="rows">
            {posts.map((p) => (
              <div className="row static" key={p.id}>
                {ed === p.id ? (
                    <div className="row-main">
                      <input type="text" aria-label="Edit post" maxLength={2000} value={edText} onChange={(e) => setEdText(e.target.value)} />
                      <span className="req-acts">
                        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !edText.trim()} onClick={saveEdit}>Save</button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEd(null)}>Cancel</button>
                      </span>
                    </div>
                  ) : (
                    <div className="row-main"><b>{p.author_name}{p.pinned ? <Pin size={13} className="ci" /> : null}</b><span>{p.body}</span><span>{timeAgo(p.created_at)}</span></div>
                  )}
                {staff ? <button type="button" className="icon-btn" aria-label="Edit post" disabled={busy} onClick={() => { setEd(p.id); setEdText(p.body); }}><Pencil size={18} /></button> : null}
                  {staff ? <button type="button" className="icon-btn" aria-label={p.pinned ? 'Unpin post' : 'Pin post'} disabled={busy} onClick={() => run(pinPost(p.id, !p.pinned))}>{p.pinned ? <PinOff size={18} /> : <Pin size={18} />}</button> : null}
                {staff || p.author === team.me ? <button type="button" className="icon-btn" aria-label="Delete post" disabled={busy} onClick={() => { if (window.confirm('Delete this post?')) run(deletePost(p.id)); }}><Trash2 size={18} /></button> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

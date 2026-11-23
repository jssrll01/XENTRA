import { ask } from '../lib/dialog';
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, FileText, Hash, Lock, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
import Skeleton from './ui/Skeleton';
import EmptyState from './ui/EmptyState';
import Avatar from './ui/Avatar';
import { TeamErr } from './TeamSub';
import { listChannels, listPosts, createPost, pinPost, deletePost, editPost } from '../lib/api';
import { timeAgo } from '../lib/format';

export default function TeamHome({ team, tick }) {
  const staff = team.my_role !== 'member';
  const canEdit = staff || !!(team.perms && team.perms.edit_posts);
  const canPin = staff || !!(team.perms && team.perms.pin_posts);
  const canPost = staff && !team.muted;
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
    <div className="tm-stack">
      {err ? <TeamErr msg={err} retry={load} /> : null}
      {!ch && !err ? <Skeleton rows={3} /> : null}
      {ch ? (
        <section className="tm-card">
          <h3 className="tm-label">Channels</h3>
          {ch.length === 0 ? <EmptyState icon={Hash} title="No channels yet" text="Channels created by the team appear here." /> : (
            <div className="tm-list">
              {ch.map((c) => (
                <Link className="tm-row" key={c.id} to={'/messages/' + c.id}>
                  <span className="tm-ic">{c.mods_only ? <Lock size={18} /> : <Hash size={18} />}</span>
                  <span className="tm-main"><b>{c.name}</b>{c.archived ? <span>Archived</span> : c.mods_only ? <span>Moderators post</span> : null}</span>
                  {c.unread > 0 ? <span className="badge">{c.unread > 99 ? '99+' : c.unread}</span> : null}
                  <ChevronRight size={18} className="tm-chev" />
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : null}
      {posts ? (
        <section className="tm-card">
          <h3 className="tm-label">Posts</h3>
          {canPost ? (
            <div className="tm-composer">
              <textarea className="tm-input" rows={2} placeholder="Share an update with the team" aria-label="Share a post" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
              <button type="button" className="tm-btn primary" disabled={busy || !text.trim()} onClick={post}>Post</button>
            </div>
          ) : null}
          {posts.length === 0 ? <EmptyState icon={FileText} title="No posts yet" text={canPost ? 'Share the first update with the team.' : 'Updates from moderators appear here.'} /> : null}
          <div className="tm-list">
            {posts.map((p) => (
              <article className="tm-post" key={p.id}>
                <div className="tm-post-top">
                  <Avatar name={p.author_name} size={36} />
                  <div className="tm-post-who"><b>{p.author_name}</b><span>{timeAgo(p.created_at)}</span></div>
                  {p.pinned ? <span className="tm-role">Pinned</span> : null}
                </div>
                {ed === p.id ? (
                  <>
                    <textarea className="tm-input" rows={3} aria-label="Edit post" maxLength={2000} value={edText} onChange={(e) => setEdText(e.target.value)} />
                    <div className="tm-btnrow">
                      <button type="button" className="tm-btn primary" disabled={busy || !edText.trim()} onClick={saveEdit}>Save</button>
                      <button type="button" className="tm-btn" onClick={() => setEd(null)}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p>{p.body}</p>
                    <div className="tm-post-acts">
                      {canEdit ? <button type="button" className="tm-ib" aria-label="Edit post" disabled={busy} onClick={() => { setEd(p.id); setEdText(p.body); }}><Pencil size={18} /></button> : null}
                      {canPin ? <button type="button" className="tm-ib" aria-label={p.pinned ? 'Unpin post' : 'Pin post'} disabled={busy} onClick={() => run(pinPost(p.id, !p.pinned))}>{p.pinned ? <PinOff size={18} /> : <Pin size={18} />}</button> : null}
                      {staff || p.author === team.me ? <button type="button" className="tm-ib" aria-label="Delete post" disabled={busy} onClick={async () => { if (await ask('Delete this post?')) run(deletePost(p.id)); }}><Trash2 size={18} /></button> : null}
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

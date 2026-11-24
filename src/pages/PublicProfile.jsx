import React, { useCallback, useEffect, useState } from 'react';
import Skeleton from '../components/ui/Skeleton';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BadgeCheck, Check, Clock, MessageCircle, RefreshCw, UserPlus } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import { getPublicProfile, startDirect, sendContactRequest } from '../lib/api';
import { fullName } from '../lib/format';
import { PALETTE } from '../lib/palette';
import { banner } from '../lib/cloudinary';

export default function PublicProfile() {
  const { username } = useParams();
  const nav = useNavigate();
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setP(null);
    const r = await getPublicProfile(username);
    if (r.ok) { setP(r.data); setErr(''); } else setErr(r.error);
  }, [username]);
  useEffect(() => { load(); }, [load]);
  const message = async () => {
    setBusy(true); setErr('');
    const r = await startDirect(p.id);
    setBusy(false);
    if (r.ok) nav('/messages/' + r.data.id); else setErr(r.error);
  };
  const add = async () => {
    setBusy(true); setErr('');
    const r = await sendContactRequest(p.id);
    setBusy(false);
    if (r.ok) load(); else setErr(r.error);
  };
  if (!p) {
    return err
      ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div>
      : <Skeleton rows={3} />;
  }
  const name = fullName(p) || p.username;
  return (
    <div className="pf-accent" style={p.accent ? { '--accent': PALETTE[p.accent] } : undefined}>
      <div className={'pf-cover' + (p.banner_url ? ' pf-cover-img' : '')} style={p.banner_url ? { backgroundImage: 'url(' + banner(p.banner_url, 900) + ')' } : (p.cover ? { '--cover': PALETTE[p.cover] } : undefined)} />
      <section className="glass card pf-pub">
        <Avatar name={name} url={p.avatar_url} size={88} />
        <h2>{name}{p.verified ? <BadgeCheck size={20} className="vbadge" aria-label="Verified" /> : null}</h2>
        <span className="note">@{p.username}</span>
        {p.status_text ? <p className="pf-bio">{p.status_text}</p> : null}
          {p.bio ? <p className="pf-bio">{p.bio}</p> : null}
        {err ? <div className="alert err">{err}</div> : null}
        <div className="pf-acts">
          {p.rel === 'self' ? <Link className="btn btn-primary btn-sm" to="/profile">Edit profile</Link> : null}
          {p.can_message ? <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={message}><MessageCircle size={16} /> Message</button> : null}
          {p.can_add ? <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={add}><UserPlus size={16} /> Add contact</button> : null}
          {p.rel === 'contact' ? <span className="rel-tag"><Check size={14} /> Contact</span> : null}
          {p.rel === 'outgoing' ? <span className="rel-tag"><Clock size={14} /> Request sent</span> : null}
          {p.rel === 'incoming' ? <Link className="btn btn-secondary btn-sm" to="/contacts">Respond in Contacts</Link> : null}
          {p.rel === 'blocked' ? <span className="rel-tag">Blocked</span> : null}
        </div>
      </section>
    </div>
  );
}

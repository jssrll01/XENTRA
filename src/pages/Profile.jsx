import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AtSign, BadgeCheck, Camera, Copy, Mail, Phone, User } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import { useProfile } from '../lib/profile';
import { updateProfile, setAvatar, checkUsername, getMyDetails, setMyDetails, usernameCooldown } from '../lib/api';
import { uploadAvatar } from '../lib/cloudinary';
import { avatarCooldown } from '../lib/api';
import { fullName } from '../lib/format';

function Item({ icon: Icon, label, required, wide, ...rest }) {
  return (
    <div className={'field' + (wide ? ' wide' : '')}>
      <span className="field-icon"><Icon size={20} /></span>
      <label className="field-body">
        <span className="field-label">{label}{required ? <b>*</b> : null}</span>
        <input {...rest} />
      </label>
    </div>
  );
}

const fromProfile = (p) => ({ first: p.first_name || '', last: p.last_name || '', username: p.username || '', phone: p.phone || '' });
const UN_MSG = { check: 'Checking...', ok: 'Username is available.', taken: 'That username is taken.', bad: '3 to 20 characters: letters, numbers or underscore.', fail: 'Could not check the username. Try again.' };
const day = (iso) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

export default function Profile() {
  const { profile, reload } = useProfile();
  const [f, setF] = useState(fromProfile(profile));
  const [det, setDet] = useState({ bio: '', cover: '', accent: '', verified: false });
  const [cool, setCool] = useState(null);
  const [derr, setDerr] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState(false);
  const [un, setUn] = useState('');
  const fileRef = useRef(null);

  const loadExtra = useCallback(async () => {
    const [d, c] = await Promise.all([getMyDetails(), usernameCooldown()]);
    if (!d.ok || !c.ok) { setDerr(d.ok ? c.error : d.error); return; }
    setDerr('');
    setDet({ bio: d.data.bio || '', cover: d.data.cover || '', accent: d.data.accent || '', verified: Boolean(d.data.verified) });
    setCool(c.data);
  }, []);
  useEffect(() => { loadExtra(); }, [loadExtra]);

  useEffect(() => {
    const u = f.username.trim().toLowerCase();
    if (!u || u === (profile.username || '')) { setUn(''); return undefined; }
    if (!/^[a-z0-9_]{3,20}$/.test(u)) { setUn('bad'); return undefined; }
    setUn('check');
    let live = true;
    const t = setTimeout(async () => {
      const r = await checkUsername(u);
      if (live) setUn(r.ok ? (r.data.available ? 'ok' : 'taken') : 'fail');
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [f.username, profile.username]);

  useEffect(() => { setF(fromProfile(profile)); }, [profile.first_name, profile.last_name, profile.username, profile.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  const locked = Boolean(profile.username) && cool !== null && cool.days_left > 0;
  const set = (k) => (e) => setF({ ...f, [k]: k === 'username' ? e.target.value.toLowerCase() : e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setErr(''); setOk(false); setNote(''); setBusy(true);
    const r = await updateProfile(f);
    if (!r.ok) { setBusy(false); setErr(r.error); return; }
    const d = await setMyDetails(det.bio, det.cover, det.accent);
    setBusy(false);
    if (!d.ok) { setErr(d.error); return; }
    await reload();
    await loadExtra();
    setOk(true);
  };

  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setErr(''); setOk(false); setUp(true);
    const cd = await avatarCooldown();
    if (cd.ok && cd.data && cd.data.next_at && new Date(cd.data.next_at) > new Date()) { setUp(false); setErr('You can change your photo again on ' + new Date(cd.data.next_at).toLocaleDateString() + '.'); return; }
    const u = await uploadAvatar(file);
    if (!u.ok) { setUp(false); setErr(u.error); return; }
    const r = await setAvatar(u.data);
    setUp(false);
    if (!r.ok) { setErr(r.error); return; }
    await reload();
  };

  const copyLink = async () => {
    setErr(''); setOk(false);
    try { await navigator.clipboard.writeText(window.location.origin + '/u/' + profile.username); setNote('Profile link copied.'); } catch (x) { setErr('Could not copy the link.'); }
  };

  return (
    <>
      <section className="glass card profile-top">
        <Avatar name={fullName(profile)} url={profile.avatar_url} size={72} />
        <div>
          <b>{fullName(profile) || 'Your profile'}{det.verified ? <BadgeCheck size={18} className="vbadge" aria-label="Verified" /> : null}</b>
          <span>{profile.username ? '@' + profile.username : 'Choose a username below'}{profile.username ? <button type="button" className="icon-btn" aria-label="Copy profile link" onClick={copyLink}><Copy size={16} /></button> : null}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={up} onClick={() => fileRef.current && fileRef.current.click()}>
            <Camera size={16} /> {up ? 'Uploading...' : 'Change photo'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
        </div>
      </section>

      {derr ? <div className="alert err with-action"><span>{derr}</span><button type="button" className="btn btn-secondary btn-sm" onClick={loadExtra}>Retry</button></div> : null}

      <form className="glass card" onSubmit={save} noValidate>
        <div className="form-grid">
          <Item icon={User} label="First name" required value={f.first} onChange={set('first')} autoComplete="given-name" maxLength={50} />
          <Item icon={User} label="Last name" value={f.last} onChange={set('last')} autoComplete="family-name" maxLength={50} />
          <Item icon={AtSign} label="Username" required wide value={f.username} onChange={set('username')} readOnly={locked} autoCapitalize="none" autoComplete="username" maxLength={20} />
          <Item icon={Phone} label="Phone (private)" wide type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" />
          <Item icon={Mail} label="Email" wide value={profile.email || ''} readOnly />
          <div className="field wide">
            <span className="field-icon"><User size={20} /></span>
            <label className="field-body">
              <span className="field-label">Bio</span>
              <textarea rows={3} maxLength={160} value={det.bio} onChange={(e) => setDet({ ...det, bio: e.target.value })} />
            </label>
          </div>
        </div>
        <p className="note">{det.bio.length}/160</p>
        {locked ? <p className="note" role="status">You can change your username again on {day(cool.next_change_at)}.</p> : null}
        {!locked && UN_MSG[un] ? <p className="note" role="status">{UN_MSG[un]}</p> : null}
        {err ? <div className="alert err">{err}</div> : null}
        {ok ? <div className="alert ok">Profile saved.</div> : null}
        {note ? <div className="alert info" role="status">{note}</div> : null}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || un === 'taken' || un === 'bad'}>{busy ? 'Saving...' : 'Save changes'}</button>
      </form>
    </>
  );
}

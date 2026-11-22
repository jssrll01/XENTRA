import React, { useEffect, useRef, useState } from 'react';
import { AtSign, Camera, Mail, Phone, User } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import { useProfile } from '../lib/profile';
import { updateProfile, setAvatar, checkUsername } from '../lib/api';
import { uploadAvatar } from '../lib/cloudinary';
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

export default function Profile() {
  const { profile, reload } = useProfile();
  const [f, setF] = useState(fromProfile(profile));
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState(false);
  const [un, setUn] = useState('');
  useEffect(() => {
    const u = f.username.trim().toLowerCase();
    if (!u || u === (profile.username || '')) { setUn(''); return undefined; }
    if (!/^[a-z0-9_.]{3,20}$/.test(u)) { setUn('bad'); return undefined; }
    setUn('check');
    let live = true;
    const t = setTimeout(async () => {
      const r = await checkUsername(u);
      if (live) setUn(r.ok ? (r.data.available ? 'ok' : 'taken') : 'fail');
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [f.username, profile.username]);
  const unMsg = { check: 'Checking...', ok: 'Username is available.', taken: 'That username is taken.', bad: '3 to 20 characters: letters, numbers, dot or underscore.', fail: 'Could not check the username.' }[un];
  const fileRef = useRef(null);

  useEffect(() => { setF(fromProfile(profile)); }, [profile.first_name, profile.last_name, profile.username, profile.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setF({ ...f, [k]: k === 'username' ? e.target.value.toLowerCase() : e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setErr(''); setOk(false); setBusy(true);
    const r = await updateProfile(f);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    await reload();
    setOk(true);
  };

  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setErr(''); setOk(false); setUp(true);
    const u = await uploadAvatar(file);
    if (!u.ok) { setUp(false); setErr(u.error); return; }
    const r = await setAvatar(u.data);
    setUp(false);
    if (!r.ok) { setErr(r.error); return; }
    await reload();
  };

  return (
    <>
      <section className="glass card profile-top">
        <Avatar name={fullName(profile)} url={profile.avatar_url} size={72} />
        <div>
          <b>{fullName(profile) || 'Your profile'}</b>
          <span>{profile.username ? '@' + profile.username : 'Choose a username below'}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={up} onClick={() => fileRef.current && fileRef.current.click()}>
            <Camera size={16} /> {up ? 'Uploading...' : 'Change photo'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
        </div>
      </section>

      <form className="glass card" onSubmit={save} noValidate>
        <div className="form-grid">
          <Item icon={User} label="First name" required value={f.first} onChange={set('first')} autoComplete="given-name" maxLength={50} />
          <Item icon={User} label="Last name" value={f.last} onChange={set('last')} autoComplete="family-name" maxLength={50} />
          <Item icon={AtSign} label="Username" required wide value={f.username} onChange={set('username')} autoCapitalize="none" autoComplete="username" maxLength={20} />
          <Item icon={Phone} label="Phone (private)" wide type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" />
          <Item icon={Mail} label="Email" wide value={profile.email || ''} readOnly />
        </div>
        {unMsg ? <p className="note" role="status">{unMsg}</p> : null}
        {err ? <div className="alert err">{err}</div> : null}
        {ok ? <div className="alert ok">Profile saved.</div> : null}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || un === 'taken' || un === 'bad'}>{busy ? 'Saving...' : 'Save changes'}</button>
      </form>
    </>
  );
}

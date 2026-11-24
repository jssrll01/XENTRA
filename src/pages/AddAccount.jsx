import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Lock, LogIn, Mail } from 'lucide-react';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import { normEmail } from '../lib/authApi';
import { addAccountSignIn } from '../lib/accounts';

export default function AddAccount() {
  const [sp] = useSearchParams();
  const [f, setF] = useState({ email: normEmail(sp.get('email')), password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!f.email.trim() || !f.password) return setErr('Enter the email and password.');
    setBusy(true);
    const r = await addAccountSignIn(f.email, f.password);
    if (!r.ok) { setBusy(false); setErr(r.code === 'unconfirmed' ? 'That email is not verified yet. Verify it first, then add it here.' : r.error); }
  };

  return (
    <section className="glass card ac-add">
      <h2>Add account</h2>
      <p className="note">Sign in with another account. Switch between accounts any time from the account menu.</p>
      {err ? <div className="alert err" role="alert">{err}</div> : null}
      <form onSubmit={submit} noValidate>
        <Field icon={Mail} label="Email Address" required type="email" placeholder="you@example.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
        <Field icon={Lock} label="Password" required type="password" placeholder="Enter the password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />
        <Button type="submit" block loading={busy} icon={LogIn}>Sign in</Button>
      </form>
      <Link className="btn btn-secondary btn-sm" to="/home">Cancel</Link>
    </section>
  );
}

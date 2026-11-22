import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, LogIn } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import { signIn, normEmail } from '../lib/authApi';

export default function SignIn() {
  const nav = useNavigate();
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!f.email.trim() || !f.password) return setErr('Enter your email and password.');
    setBusy(true);
    const r = await signIn(f.email, f.password);
    setBusy(false);
    if (r.code === 'unconfirmed') return nav('/verify-email?resend=1&email=' + encodeURIComponent(normEmail(f.email)));
    if (!r.ok) setErr(r.error);
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue to XENTRA." footer={<>New to XENTRA? <Link to="/signup">Create Account</Link></>}>
      <form onSubmit={submit} noValidate>
        {err ? <div className="alert err" role="alert">{err}</div> : null}
        <Field icon={Mail} label="Email Address" required type="email" placeholder="you@gmail.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
        <Field icon={Lock} label="Password" required type="password" placeholder="Enter your password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />
        <div className="row-end"><Link to="/forgot-password">Forgot password?</Link></div>
        <Button type="submit" block loading={busy} icon={LogIn}>Sign In</Button>
      </form>
    </AuthLayout>
  );
}

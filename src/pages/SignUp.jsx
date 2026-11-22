import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, AtSign, Mail, Phone, Lock, UserPlus, ShieldCheck } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import { signUpEmail, isGmail, normEmail } from '../lib/authApi';

const check = (f) => {
  const e = {};
  if (f.name.trim().length < 2) e.name = 'Enter your full name.';
  if (!/^[a-z0-9_.]{3,20}$/.test(f.username.trim().toLowerCase())) e.username = '3 to 20 characters: letters, numbers, dot or underscore.';
  if (!isGmail(f.email)) e.email = 'Use a @gmail.com address.';
  if (f.phone.trim() && !/^[+0-9\s-]{7,16}$/.test(f.phone.trim())) e.phone = 'Enter a valid phone number or leave it empty.';
  if (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) e.password = 'At least 8 characters with a letter and a number.';
  if (f.confirm !== f.password) e.confirm = 'Passwords do not match.';
  return e;
};

export default function SignUp() {
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', username: '', email: '', phone: '', password: '', confirm: '' });
  const [err, setErr] = useState({});
  const [top, setTop] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setTop('');
    const v = check(f);
    setErr(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    const r = await signUpEmail(f);
    setBusy(false);
    if (!r.ok) return setTop(r.error);
    nav('/verify-email?email=' + encodeURIComponent(normEmail(f.email)));
  };

  return (
    <AuthLayout title="Create Account" subtitle="Start your journey with XENTRA today." footer={<>Already have an account? <Link to="/signin">Sign In</Link></>}>
      <form onSubmit={submit} noValidate>
        {top ? <div className="alert err" role="alert">{top}</div> : null}
        <Field icon={User} label="Full Name" required placeholder="Enter your full name" value={f.name} onChange={set('name')} error={err.name} autoComplete="name" />
        <Field icon={AtSign} label="Username" required placeholder="Choose a username" value={f.username} onChange={set('username')} error={err.username} autoCapitalize="none" autoComplete="username" />
        <Field icon={Mail} label="Email Address" required type="email" placeholder="you@gmail.com" value={f.email} onChange={set('email')} error={err.email} autoComplete="email" />
        <Field icon={Phone} label="Phone (optional)" type="tel" placeholder="Enter your phone number" value={f.phone} onChange={set('phone')} error={err.phone} autoComplete="tel" />
        <Field icon={Lock} label="Password" required type="password" placeholder="Create a strong password" value={f.password} onChange={set('password')} error={err.password} autoComplete="new-password" />
        <Field icon={Lock} label="Confirm Password" required type="password" placeholder="Confirm your password" value={f.confirm} onChange={set('confirm')} error={err.confirm} autoComplete="new-password" />
        <Button type="submit" block loading={busy} icon={UserPlus}>Create Account</Button>
      </form>
      <div className="note"><ShieldCheck size={26} /><div><b>Your data is protected</b>Passwords are encrypted and we verify every email with a code.</div></div>
    </AuthLayout>
  );
}

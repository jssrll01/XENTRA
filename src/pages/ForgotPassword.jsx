import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, KeyRound, Lock, Send, ShieldCheck, RefreshCw } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { sendResetCode, verifyRecovery, setNewPassword } from '../lib/authApi';

export default function ForgotPassword() {
  const nav = useNavigate();
  const { show } = useToast();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState({});
  const [top, setTop] = useState('');
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const sendCode = async (e) => {
    if (e) e.preventDefault();
    setTop('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr({ email: 'Enter a valid email address.' });
    setErr({});
    setBusy(true);
    const r = await sendResetCode(email);
    setBusy(false);
    if (!r.ok) return setTop(r.error);
    setStep('reset');
    setWait(60);
    show('If that account exists, a code is on its way.');
  };

  const reset = async (e) => {
    e.preventDefault();
    setTop('');
    const v = {};
    if (!verified && code.length !== 6) v.code = 'Enter the 6-digit code.';
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) v.pw = 'At least 8 characters with a letter and a number.';
    if (pw2 !== pw) v.pw2 = 'Passwords do not match.';
    setErr(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    if (!verified) {
      const r = await verifyRecovery(email, code);
      if (!r.ok) { setBusy(false); return setTop(r.error); }
      setVerified(true);
    }
    const u = await setNewPassword(pw);
    setBusy(false);
    if (!u.ok) return setTop(u.error);
    show('Password updated.');
    nav('/home', { replace: true });
  };

  return (
    <AuthLayout
      title={step === 'email' ? 'Forgot password' : 'Set a new password'}
      subtitle={step === 'email' ? 'Enter your email and we will send you a 6-digit code.' : 'Enter the code sent to ' + email.trim().toLowerCase() + ' and choose a new password.'}
      footer={<>Remembered it? <Link to="/signin">Sign In</Link></>}
    >
      {top ? <div className="alert err" role="alert">{top}</div> : null}
      {step === 'email' ? (
        <form onSubmit={sendCode} noValidate>
          <Field icon={Mail} label="Email Address" required type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} error={err.email} autoComplete="email" />
          <Button type="submit" block loading={busy} icon={Send}>Send code</Button>
        </form>
      ) : (
        <form onSubmit={reset} noValidate>
          {!verified ? (
            <Field icon={KeyRound} label="6-digit code" required inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} error={err.code} autoComplete="one-time-code" />
          ) : (
            <div className="alert ok">Code verified. Choose your new password.</div>
          )}
          <Field icon={Lock} label="New Password" required type="password" placeholder="Create a strong password" value={pw} onChange={(e) => setPw(e.target.value)} error={err.pw} autoComplete="new-password" />
          <Field icon={Lock} label="Confirm Password" required type="password" placeholder="Confirm your password" value={pw2} onChange={(e) => setPw2(e.target.value)} error={err.pw2} autoComplete="new-password" />
          <Button type="submit" block loading={busy} icon={ShieldCheck}>Update password</Button>
          {!verified ? (
            <Button type="button" variant="ghost" block icon={RefreshCw} disabled={wait > 0 || busy} onClick={sendCode} style={{ marginTop: 8 }}>{wait > 0 ? 'Resend code in ' + wait + 's' : 'Resend code'}</Button>
          ) : null}
        </form>
      )}
    </AuthLayout>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import Button from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { verifySignup, resendCode, normEmail } from '../lib/authApi';

export default function VerifyEmail() {
  const [sp] = useSearchParams();
  const { show } = useToast();
  const email = normEmail(sp.get('email'));
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [wait, setWait] = useState(0);
  const sent = useRef(false);

  const resend = async () => {
    setErr('');
    const r = await resendCode(email);
    if (r.ok) { show('A new code was sent.'); setWait(60); } else setErr(r.error);
  };

  useEffect(() => {
    if (sp.get('resend') === '1' && email && !sent.current) { sent.current = true; resend(); }
  }, []);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const verify = async (c) => {
    setBusy(true);
    setErr('');
    const r = await verifySignup(email, c);
    setBusy(false);
    if (!r.ok) { setErr(r.error); setCode(''); }
  };
  const onChange = (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(v);
    if (v.length === 6) verify(v);
  };

  if (!email) return <Navigate to="/signup" replace />;
  return (
    <AuthLayout title="Verify your email" subtitle={'Enter the 6-digit code we sent to ' + email + '.'} footer={<>Wrong address? <Link to="/signup">Start again</Link></>}>
      {err ? <div className="alert err" role="alert">{err}</div> : null}
      <input className="otp-input" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} placeholder="000000" aria-label="Verification code" value={code} onChange={onChange} disabled={busy} />
      <Button type="button" variant="secondary" block icon={RefreshCw} disabled={wait > 0 || busy} onClick={resend}>{wait > 0 ? 'Resend code in ' + wait + 's' : 'Resend code'}</Button>
    </AuthLayout>
  );
}

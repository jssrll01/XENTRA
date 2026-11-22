import React, { useEffect, useState } from 'react';
import { Database, ShieldCheck } from 'lucide-react';
import Logo from '../components/Logo';
import { SUPABASE_URL, SUPABASE_KEY, configured } from '../lib/supabase';

const LABEL = { checking: 'Checking', online: 'Online', offline: 'Unreachable', missing: 'Not configured' };
const CLS = { checking: '', online: 'ok', offline: 'bad', missing: 'bad' };

export default function Welcome() {
  const [state, setState] = useState(configured ? 'checking' : 'missing');

  useEffect(() => {
    if (!configured) return undefined;
    let alive = true;
    fetch(SUPABASE_URL + '/auth/v1/health', { headers: { apikey: SUPABASE_KEY } })
      .then((r) => { if (alive) setState(r.ok ? 'online' : 'offline'); })
      .catch(() => { if (alive) setState('offline'); });
    return () => { alive = false; };
  }, []);

  const secure = typeof window !== 'undefined' && (window.location.protocol === 'https:' || window.location.hostname === 'localhost');

  return (
    <main className="center-page">
      <Logo size={56} />
      <section className="glass status-card" aria-label="System status">
        <div className="status-row">
          <Database size={20} />
          <span className="grow">Backend</span>
          <span className={'pill ' + CLS[state]}><i />{LABEL[state]}</span>
        </div>
        <div className="status-row">
          <ShieldCheck size={20} />
          <span className="grow">Secure connection</span>
          <span className={'pill ' + (secure ? 'ok' : 'bad')}><i />{secure ? 'HTTPS' : 'Not secure'}</span>
        </div>
      </section>
      <div className="foot">Powered by XMARKET</div>
    </main>
  );
}

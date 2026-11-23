import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Splash } from './Guards';
import { loadConfig } from '../lib/config';

export default function ConfigGate({ children }) {
  const [st, setSt] = useState('loading');
  const run = useCallback(async () => {
    setSt('loading');
    const r = await loadConfig();
    setSt(r.ok ? (r.stale ? 'stale' : 'ok') : 'error');
  }, []);
  useEffect(() => { run(); }, [run]);

  if (st === 'loading') return <Splash />;
  if (st === 'error') {
    return (
      <main className="center-page">
        <div className="glass card">
          <div className="alert err with-action" role="alert">
            <span>Could not load app settings. Check your connection.</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={run}><RefreshCw size={16} /> Retry</button>
          </div>
        </div>
      </main>
    );
  }
  if (st === 'stale') {
    return (
      <>
        <div className="alert info" role="status">Using saved settings. Could not refresh them.</div>
        {children}
      </>
    );
  }
  return children;
}

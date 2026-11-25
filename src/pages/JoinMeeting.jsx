import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import Skeleton from '../components/ui/Skeleton';
import { joinByCode, joinMeeting } from '../lib/call';

export default function JoinMeeting() {
  const { code } = useParams();
  const nav = useNavigate();
  const [err, setErr] = useState('');
  const go = useCallback(async () => {
    setErr('');
    const r = await joinByCode(code);
    if (!r.ok || !r.data) { setErr(r.error || 'Could not open this invite.'); return; }
    nav('/home', { replace: true });
    joinMeeting(r.data.id, r.data.title, r.data.mode);
  }, [code, nav]);
  useEffect(() => { go(); }, [go]);
  return (
    <>
      <div className="page-head"><h2>Meeting invite</h2></div>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={go}><RefreshCw size={16} /> Retry</button></div> : <Skeleton rows={2} />}
    </>
  );
}

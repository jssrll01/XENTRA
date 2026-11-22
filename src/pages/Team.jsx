import React, { useCallback, useEffect, useState } from 'react';
import Skeleton from '../components/ui/Skeleton';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LogOut, RefreshCw } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import TeamHome from '../components/TeamHome';
import TeamMembers from '../components/TeamMembers';
import TeamActivity from '../components/TeamActivity';
import TeamManage from '../components/TeamManage';
import { getTeam, leaveTeam } from '../lib/api';
import { useSummary } from '../lib/summary';

export default function Team() {
  const { id } = useParams();
  const nav = useNavigate();
  const { tick } = useSummary();
  const [t, setT] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('home');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await getTeam(id);
    if (r.ok) { setT(r.data); setErr(''); } else setErr(r.error);
  }, [id]);
  useEffect(() => { load(); }, [load, tick]);
  const leave = async () => {
    if (!window.confirm('Leave this team?')) return;
    setBusy(true);
    const r = await leaveTeam(id);
    setBusy(false);
    if (r.ok) nav('/teams'); else setErr(r.error);
  };
  const manage = t && (t.my_role === 'owner' || t.my_role === 'admin');
  const cur = tab === 'manage' && !manage ? 'home' : tab;
  const tabs = [['home', 'Home'], ['members', 'Members'], ['activity', 'Activity']].concat(manage ? [['manage', 'Manage']] : []);
  return (
    <>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {!t && !err ? <Skeleton /> : null}
      {t ? (
        <>
          <section className="glass card add-card">
            <Avatar name={t.name} url={t.avatar_url} size={72} />
            <h2>{t.name}</h2>
            {t.description ? <span>{t.description}</span> : null}
            <span className="rel-tag">{t.members} members - you are {t.my_role}{t.muted ? ' (muted)' : ''}</span>
            <Link className="see-all" to="/teams">All teams</Link>
          </section>
          <div className="tabs" role="tablist">
            {tabs.map((x) => <button type="button" role="tab" key={x[0]} aria-selected={cur === x[0]} className={cur === x[0] ? 'on' : ''} onClick={() => setTab(x[0])}>{x[1]}</button>)}
          </div>
          {cur === 'home' ? <TeamHome team={t} tick={tick} /> : null}
          {cur === 'members' ? <TeamMembers team={t} tick={tick} /> : null}
          {cur === 'activity' ? <TeamActivity team={t} tick={tick} /> : null}
          {cur === 'manage' ? <TeamManage team={t} tick={tick} onChanged={load} /> : null}
          <button type="button" className="btn btn-secondary btn-block" disabled={busy} onClick={leave}><LogOut size={16} /> Leave team</button>
        </>
      ) : null}
    </>
  );
}

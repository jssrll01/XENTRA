import { ask } from '../lib/dialog';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, LogOut } from 'lucide-react';
import Skeleton from '../components/ui/Skeleton';
import Avatar from '../components/ui/Avatar';
import TeamHome from '../components/TeamHome';
import TeamMembers from '../components/TeamMembers';
import TeamActivity from '../components/TeamActivity';
import TeamManage from '../components/TeamManage';
import { TeamErr } from '../components/TeamSub';
import { getTeam, leaveTeam, deleteTeam } from '../lib/api';
import DeleteSheet from '../components/DeleteSheet';
import { useSummary } from '../lib/summary';

export default function Team() {
  const { id } = useParams();
  const nav = useNavigate();
  const [del, setDel] = useState(false);
  const { tick } = useSummary();
  const [t, setT] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('home');
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const load = useCallback(async () => {
    const r = await getTeam(id);
    if (r.ok) { setT(r.data); setErr(''); } else setErr(r.error);
  }, [id]);
  useEffect(() => { load(); }, [load, tick]);
  const leave = async () => {
    if (!await ask('Leave this team?')) return;
    setBusy(true);
    const r = await leaveTeam(id);
    setBusy(false);
    if (r.ok) nav('/teams'); else setErr(r.error);
  };
  const manage = t && (t.my_role === 'owner' || t.my_role === 'admin');
  const cur = tab === 'manage' && !manage ? 'home' : tab;
  const tabs = [['home', 'Home'], ['members', 'Members'], ['activity', 'Activity']].concat(manage ? [['manage', 'Manage']] : []);
  const long = t && t.description && t.description.length > 110;
  return (
    <div className="tm">
      {err ? <TeamErr msg={err} retry={load} /> : null}
      {!t && !err ? <Skeleton rows={3} /> : null}
      {t ? (
        <>
          <header className="tm-head">
            <button type="button" className="tm-ib" aria-label="Back to teams" onClick={() => nav('/teams')}><ArrowLeft size={20} /></button>
            <Avatar name={t.name} url={t.avatar_url} size={48} />
            <div className="tm-title"><h2>{t.name}</h2><span>{t.members} {t.members === 1 ? 'member' : 'members'}{t.muted ? ' - muted' : ''}</span></div>
            <span className="tm-role">{t.my_role}</span>
          </header>
          {t.description ? (
            <div className="tm-about">
              <p className={more ? '' : 'tm-clamp'}>{t.description}</p>
              {long ? <button type="button" className="tm-more" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'Show less' : 'Show more'}</button> : null}
            </div>
          ) : null}
          <div className="tm-tabs" role="tablist">
            {tabs.map((x) => <button type="button" role="tab" key={x[0]} aria-selected={cur === x[0]} onClick={() => setTab(x[0])}>{x[1]}</button>)}
          </div>
          <div role="tabpanel">
            {cur === 'home' ? <TeamHome team={t} tick={tick} /> : null}
            {cur === 'members' ? <TeamMembers team={t} tick={tick} /> : null}
            {cur === 'activity' ? <TeamActivity team={t} tick={tick} /> : null}
            {cur === 'manage' ? <TeamManage team={t} tick={tick} onChanged={load} /> : null}
          </div>
          {cur === 'home' ? (
            <section className="tm-dz">
              <h3 className="tm-label">Danger zone</h3>
              <button type="button" className="tm-btn danger" disabled={busy} onClick={leave}><LogOut size={16} /> Leave team</button>
              {t.my_role === 'owner' ? <button type="button" className="tm-btn danger" onClick={() => setDel(true)}>Delete team</button> : null}
              {del ? <DeleteSheet title="Delete team" name={t.name} warn="All members are removed immediately and the team, its channels and chats are deleted. It cannot be undone." onDelete={(x) => deleteTeam(id, x)} onClose={() => setDel(false)} onDone={() => nav('/teams')} /> : null}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

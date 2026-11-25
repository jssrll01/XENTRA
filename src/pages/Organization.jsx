import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Megaphone, Pin } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import OrgMembers from '../components/OrgMembers';
import OrgManage, { canManageOrg } from '../components/OrgManage';
import { TeamErr } from '../components/TeamSub';
import { ask } from '../lib/dialog';
import { getOrg, leaveOrg, deleteOrg, listOrgAnnouncements, markOrgAnnouncementRead } from '../lib/api';
import DeleteSheet from '../components/DeleteSheet';
import { timeAgo } from '../lib/format';
import { useSummary } from '../lib/summary';

function Announcements({ org, tick }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState('');
  const load = useCallback(async () => {
    const r = await listOrgAnnouncements(org.id);
    if (r.ok) { setRows(r.data || []); setErr(''); } else setErr(r.error);
  }, [org.id]);
  useEffect(() => { load(); }, [load, tick]);
  const toggle = async (a) => {
    setOpen(open === a.id ? '' : a.id);
    if (!a.read && a.state !== 'scheduled') {
      const r = await markOrgAnnouncementRead(a.id);
      if (r.ok) setRows((x) => x.map((y) => (y.id === a.id ? { ...y, read: true } : y))); else setErr(r.error);
    }
  };
  return (
    <>
      {err ? <TeamErr msg={err} retry={load} /> : null}
      {!rows && !err ? <Skeleton /> : null}
      {rows && rows.length === 0 ? <EmptyState icon={Megaphone} title="No announcements" text="Updates from the organization appear here." /> : null}
      {rows && rows.length > 0 ? (
        <section className="tm-card"><div className="tm-list">
          {rows.map((a) => (
            <div className="org-ann" key={a.id}>
              <button type="button" className="tm-row" aria-expanded={open === a.id} onClick={() => toggle(a)}>
                <span className={a.read || a.state === 'scheduled' ? 'org-dot off' : 'org-dot'} />
                <div className="tm-main"><b>{a.title}</b><span>{a.state === 'live' ? timeAgo(a.publish_at) : a.state}</span></div>
                {a.pinned ? <Pin size={16} className="tm-chev" /> : null}
              </button>
              {open === a.id ? <p className="org-body">{a.body}</p> : null}
            </div>
          ))}
        </div></section>
      ) : null}
    </>
  );
}

export default function Organization() {
  const { id } = useParams();
  const nav = useNavigate();
  const { tick } = useSummary();
  const [o, setO] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('home');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const load = useCallback(async () => {
    const r = await getOrg(id);
    if (r.ok) { setO(r.data); setErr(''); } else setErr(r.error);
  }, [id]);
  useEffect(() => { load(); }, [load, tick]);
  const leave = async () => {
    if (!await ask('Leave this organization?')) return;
    setBusy(true);
    const r = await leaveOrg(id);
    setBusy(false);
    if (r.ok) nav('/organizations'); else setErr(r.error);
  };
  const manage = o && canManageOrg(o);
  const cur = tab === 'manage' && !manage ? 'home' : tab;
  const tabs = [['home', 'Home'], ['members', 'Members']].concat(manage ? [['manage', 'Manage']] : []);
  return (
    <div className="tm org">
      {err ? <TeamErr msg={err} retry={load} /> : null}
      {!o && !err ? <Skeleton rows={3} /> : null}
      {o ? (
        <>
          <header className="tm-head">
            <button type="button" className="tm-ib" aria-label="Back to organizations" onClick={() => nav('/organizations')}><ArrowLeft size={20} /></button>
            <Avatar name={o.name} url={o.logo_url} size={48} />
            <div className="tm-title"><h2>{o.name}</h2><span>{o.members} {o.members === 1 ? 'member' : 'members'}</span></div>
            <span className="tm-role">{o.my_role}</span>
          </header>
          {o.description ? <p className="tm-hint">{o.description}</p> : null}
          <div className="tm-tabs" role="tablist">
            {tabs.map((x) => <button type="button" role="tab" key={x[0]} aria-selected={cur === x[0]} onClick={() => setTab(x[0])}>{x[1]}</button>)}
          </div>
          {cur === 'home' ? <Announcements org={o} tick={tick} /> : null}
          {cur === 'members' ? <OrgMembers org={o} tick={tick} onChanged={load} /> : null}
          {cur === 'manage' ? <OrgManage org={o} tick={tick} onChanged={load} /> : null}
          {o.my_role === 'owner' ? (
            <div className="tm-foot">
              <p className="tm-hint">Owners must transfer ownership before leaving.</p>
              <button type="button" className="tm-btn danger" onClick={() => setDel(true)}>Delete organization</button>
              {del ? <DeleteSheet title="Delete organization" name={o.name} warn="This removes every member and all organization data immediately. It cannot be undone." onDelete={(t) => deleteOrg(id, t)} onClose={() => setDel(false)} onDone={() => nav('/organizations')} /> : null}
            </div>
          ) : (
            <div className="tm-foot"><button type="button" className="tm-btn danger" disabled={busy} onClick={leave}>Leave organization</button></div>
          )}
        </>
      ) : null}
    </div>
  );
}

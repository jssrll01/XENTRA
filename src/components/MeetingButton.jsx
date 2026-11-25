import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { useCall, meetingFor, startMeeting, joinMeeting } from '../lib/call';

export default function MeetingButton({ cid, name }) {
  const c = useCall();
  const [m, setM] = useState(null);
  useEffect(() => {
    let on = true;
    const load = async () => {
      const r = await meetingFor(cid);
      if (on && r.ok) setM(r.data && r.data.id ? r.data : null);
    };
    load();
    const t = setInterval(load, 10000);
    return () => { on = false; clearInterval(t); };
  }, [cid, c.phase]);
  const go = () => (m ? joinMeeting(m.id, m.title || name, m.mode) : startMeeting(cid, name));
  return (
    <button type="button" className="icon-btn" aria-label={m ? 'Join meeting' : 'Start meeting'} disabled={c.phase !== 'IDLE'} onClick={go}>
      <Users size={20} />{m ? <span className="mt-dot" aria-hidden="true" /> : null}
    </button>
  );
}

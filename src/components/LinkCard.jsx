import React, { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import { getLinkPreview } from '../lib/api';

export default function LinkCard({ url }) {
  const [p, setP] = useState(null);
  const [bad, setBad] = useState(false);
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { host = url; }
  useEffect(() => {
    let live = true;
    let tries = 0;
    let t = null;
    setP(null);
    setBad(false);
    const run = async () => {
      const r = await getLinkPreview(url);
      if (!live || !r.ok) return;
      setP(r.data);
      tries += 1;
      if (r.data.status === 'pending' && tries < 8) t = setTimeout(run, 1800);
    };
    run();
    return () => { live = false; clearTimeout(t); };
  }, [url]);
  const ok = p && p.status === 'ok';
  return (
    <a className={'linkcard' + (ok ? ' rich' : '')} href={url} target="_blank" rel="noopener noreferrer">
      {ok && p.image && !bad ? <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} /> : <Link2 size={18} />}
      <span>
        <b>{ok && p.title ? p.title : host}</b>
        {ok && p.description ? <em>{p.description}</em> : null}
        <i>{ok && p.site ? p.site : url}</i>
      </span>
    </a>
  );
}

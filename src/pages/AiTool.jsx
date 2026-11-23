import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react';
import Avatar from '../components/ui/Avatar';
import Skeleton from '../components/ui/Skeleton';
import { getAiTool } from '../lib/api';

export default function AiTool() {
  const { slug } = useParams();
  const [t, setT] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setT(null);
    const r = await getAiTool(slug);
    if (r.ok) { setT(r.data); setErr(''); } else setErr(r.error);
  }, [slug]);
  useEffect(() => { load(); }, [load]);
  return (
    <main className="ai-page">
      <Link className="icon-btn ai-back" to="/ai" aria-label="Back to AI tools"><ArrowLeft size={20} /></Link>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {!t && !err ? <Skeleton /> : null}
      {t ? (
        <>
          <section className="glass card ai-hero">
            <Avatar name={t.name} url={null} size={72} />
            <h2>{t.name}</h2>
            <span className="rel-tag">{t.category}</span>
            <span className="note">{t.tagline}</span>
          </section>
          <section className="glass card">
            <div className="card-head"><h2>About</h2></div>
            <p>{t.description}</p>
          </section>
          <section className="glass card">
            <div className="card-head"><h2>Made by</h2></div>
            <p>{t.company}</p>
          </section>
          {t.best_for ? (
            <section className="glass card">
              <div className="card-head"><h2>Best for</h2></div>
              <p>{t.best_for}</p>
            </section>
          ) : null}
          <a className="btn btn-primary ai-fab" href={t.website_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} /> Open</a>
        </>
      ) : null}
    </main>
  );
}

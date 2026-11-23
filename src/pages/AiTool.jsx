import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react';
import AiLogo from '../components/AiLogo';
import Skeleton from '../components/ui/Skeleton';
import { getAiTool } from '../lib/api';

const OVERVIEW = [
  ['what_is', 'What is this AI?'], ['purpose', 'Primary purpose'], ['how_it_works', 'How it works'],
  ['unique_points', 'What makes it unique'], ['problems_solved', 'Problems it solves'], ['audience', 'Target audience'],
  ['vs_competitors', 'Versus competitors'], ['strengths', 'Strongest capabilities'],
];
const day = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '');

function Facts({ title, rows }) {
  if (!rows.length) return null;
  return (
    <section className="glass card">
      <div className="card-head"><h2>{title}</h2></div>
      <div className="ai-facts">
        {rows.map((f, i) => (
          <div className="ai-fact" key={i}>
            <span>{f.label}</span>
            <b>{f.value}</b>
            {f.as_of || f.source_url ? (
              <small>{f.as_of ? 'As of ' + day(f.as_of) : ''}{f.as_of && f.source_url ? ' - ' : ''}{f.source_url ? <a href={f.source_url} target="_blank" rel="noopener noreferrer">Source</a> : null}</small>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

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
  const details = t ? [['Developer', t.company], ['Category', t.category], ['Subcategories', (t.subcategories || []).join(', ')], ['Launch date', t.launch_date], ['Current version', t.current_version]].filter((x) => x[1]) : [];
  const perf = t ? t.facts.filter((f) => f.grp === 'performance') : [];
  const bench = t ? t.facts.filter((f) => f.grp === 'benchmark') : [];
  return (
    <main className="ai-page">
      <Link className="icon-btn ai-back" to="/ai" aria-label="Back to AI tools"><ArrowLeft size={20} /></Link>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={16} /> Retry</button></div> : null}
      {!t && !err ? <Skeleton /> : null}
      {t ? (
        <>
          <section className="glass card ai-hero">
            <div className="ai-cover" style={t.cover_url ? { backgroundImage: 'url(' + t.cover_url + ')' } : undefined} />
            <AiLogo url={t.logo_url} size={72} />
            <h2>{t.name}</h2>
            <span className="rel-tag">{t.category}</span>
            <span className="note">{t.tagline}</span>
          </section>
          <section className="glass card">
            <div className="card-head"><h2>About</h2></div>
            <p>{t.description}</p>
            {t.best_for ? <p className="note">Best for: {t.best_for}</p> : null}
          </section>
          {OVERVIEW.some((o) => t[o[0]]) ? (
            <section className="glass card">
              <div className="card-head"><h2>Overview</h2></div>
              {OVERVIEW.filter((o) => t[o[0]]).map((o) => (
                <div className="ai-block" key={o[0]}><h3 className="sub-h">{o[1]}</h3><p>{t[o[0]]}</p></div>
              ))}
            </section>
          ) : null}
          <section className="glass card">
            <div className="card-head"><h2>Details</h2></div>
            <div className="ai-facts">
              {details.map((d) => <div className="ai-fact" key={d[0]}><span>{d[0]}</span><b>{d[1]}</b></div>)}
            </div>
          </section>
          <Facts title="Performance" rows={perf} />
          <Facts title="Benchmarks" rows={bench} />
          <a className="btn btn-primary ai-fab" href={t.website_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} /> Open</a>
        </>
      ) : null}
    </main>
  );
}

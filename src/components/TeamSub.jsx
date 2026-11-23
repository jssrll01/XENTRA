import React from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';

export function TeamErr({ msg, retry }) {
  return (
    <div className="alert err with-action"><span>{msg}</span><button type="button" className="btn btn-secondary btn-sm" onClick={retry}><RefreshCw size={16} /> Retry</button></div>
  );
}

export default function TeamSub({ title, onBack, children }) {
  return (
    <section className="tm-sub">
      <div className="tm-sub-head">
        <button type="button" className="tm-ib" aria-label="Back to Manage" onClick={onBack}><ArrowLeft size={20} /></button>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export default function CodeBlock({ code }) {
  const [state, setState] = useState('');
  const copy = async (e) => {
    e.stopPropagation();
    let ok = false;
    try { await navigator.clipboard.writeText(code); ok = true; } catch (err) { ok = false; }
    setState(ok ? 'ok' : 'fail');
    setTimeout(() => setState(''), 1500);
  };
  return (
    <span className="cblock">
      <span role="button" tabIndex={0} className="cb-copy" aria-label="Copy code" onClick={copy}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copy(e); } }}>
        {state === 'ok' ? <Check size={14} /> : <Copy size={14} />} {state === 'ok' ? 'Copied' : state === 'fail' ? 'Could not copy' : 'Copy'}
      </span>
      <code className="cb-code">{code}</code>
    </span>
  );
}

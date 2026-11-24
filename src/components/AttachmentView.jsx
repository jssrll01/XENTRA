import React, { useCallback, useEffect, useState } from 'react';
import { FileText, FileX, RefreshCw } from 'lucide-react';
import { fmtSize, signedUrl } from '../lib/files';
import { openLightbox } from '../lib/lightbox';

export default function AttachmentView({ a }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setErr('');
    const r = await signedUrl(a.path);
    if (r.ok) setUrl(r.data); else setErr(r.error);
  }, [a.path]);
  useEffect(() => { load(); }, [load]);
  const isImg = a.mime.startsWith('image/');
  if (a.expired_at) return <div className="att"><FileX size={24} /><span className="att-t"><b>{a.name}</b><span>File expired</span></span></div>;
  if (err) return <div className="att"><span className="att-t"><b>{a.name}</b><span>{err}</span></span><button type="button" className="icon-btn" aria-label="Retry" onClick={load}><RefreshCw size={16} /></button></div>;
  if (isImg) return <a className="att img" href={url || undefined} target="_blank" rel="noreferrer" onClick={(e) => { if (url) { e.preventDefault(); openLightbox(url); } }}>{url ? <img src={url} alt={a.name} loading="lazy" /> : <span className="att-t"><b>{a.name}</b><span>Loading...</span></span>}</a>;
  return (
    <a className="att" href={url || undefined} target="_blank" rel="noreferrer" download={a.name}>
      <FileText size={24} /><span className="att-t"><b>{a.name}</b><span>{fmtSize(a.size)}</span></span>
    </a>
  );
}

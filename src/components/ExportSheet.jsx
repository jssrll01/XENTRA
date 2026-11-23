import React, { useState } from 'react';
import Sheet from './Sheet';
import { supabase } from '../lib/supabase';
import { exportConversation } from '../lib/api';
import { fullName } from '../lib/format';

export default function ExportSheet({ conv, onClose }) {
  const [fmt, setFmt] = useState('text');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState(null);
  const go = async () => {
    setBusy(true); setErr(''); setRes(null);
    const r = await exportConversation(conv.id, fmt);
    if (!r.ok) { setBusy(false); setErr(r.error); return; }
    const d = r.data;
    const up = await supabase.storage.from('exports').upload(d.path, new Blob([d.content], { type: d.mime }), { contentType: d.mime, upsert: false });
    if (up.error) { setBusy(false); setErr('Upload failed: ' + up.error.message); return; }
    const s = await supabase.storage.from('exports').createSignedUrl(d.path, 300, { download: d.filename });
    setBusy(false);
    if (s.error) { setErr('Could not create the download link: ' + s.error.message); return; }
    setRes({ url: s.data.signedUrl, name: d.filename, count: d.count, truncated: d.truncated });
  };
  return (
    <Sheet title="Export chat" onClose={onClose}>
      <p className="exp-note">{fullName(conv.other)}. Only messages you can see are included. Limit: 3 exports per hour. Messages are deleted after 7 days.</p>
      {err ? <div className="alert err">{err}</div> : null}
      <label className="po-chk"><input type="radio" name="exp-fmt" checked={fmt === 'text'} onChange={() => setFmt('text')} /> Plain text (.txt)</label>
      <label className="po-chk"><input type="radio" name="exp-fmt" checked={fmt === 'json'} onChange={() => setFmt('json')} /> JSON (.json)</label>
      {res ? (
        <>
          <a className="btn btn-primary btn-block" href={res.url} download={res.name}>Download {res.name}</a>
          <p className="exp-note">{res.count} messages. The link works for 5 minutes.{res.truncated ? ' Only the latest 5000 messages are included.' : ''}</p>
        </>
      ) : (
        <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={go}>{busy ? 'Preparing...' : 'Export'}</button>
      )}
    </Sheet>
  );
}

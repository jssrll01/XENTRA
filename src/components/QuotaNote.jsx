import React, { useEffect, useState } from 'react';
import { getUploadQuota } from '../lib/api';
import { fmtSize } from '../lib/files';

export default function QuotaNote({ tick }) {
  const [q, setQ] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    getUploadQuota().then((r) => { if (!live) return; if (r.ok) { setQ(r.data); setErr(''); } else setErr(r.error); });
    return () => { live = false; };
  }, [tick]);
  if (err) return <p className="purge-note">{err}</p>;
  if (!q) return null;
  return <p className="purge-note">Left this hour: images {fmtSize(q.image_left)}, documents {fmtSize(q.doc_left)}</p>;
}

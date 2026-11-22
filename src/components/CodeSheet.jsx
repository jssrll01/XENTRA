import React, { useCallback, useEffect, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import QRCode from 'qrcode';
import Sheet from './Sheet';
import { getMyCode, regenerateMyCode } from '../lib/api';

const link = (c) => window.location.origin + '/add/' + c;

export default function CodeSheet({ onClose }) {
  const [code, setCode] = useState(null);
  const [img, setImg] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const apply = useCallback(async (r) => {
    if (!r.ok) { setErr(r.error); return; }
    setErr('');
    setCode(r.data.code);
    try { setImg(await QRCode.toDataURL(link(r.data.code), { margin: 1, width: 280 })); } catch (e) { setErr('Could not draw the QR code.'); }
  }, []);
  useEffect(() => { getMyCode().then(apply); }, [apply]);
  const regen = async () => {
    if (!window.confirm('Make a new code? Your old QR code and link stop working.')) return;
    setNote('');
    apply(await regenerateMyCode());
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link(code)); setNote('Link copied'); } catch (e) { setNote('Could not copy.'); }
  };
  return (
    <Sheet title="My contact code" onClose={onClose}>
      {err ? <div className="alert err with-action"><span>{err}</span><button type="button" className="btn btn-secondary btn-sm" onClick={() => getMyCode().then(apply)}><RefreshCw size={16} /> Retry</button></div> : null}
      {note ? <div className="alert info">{note}</div> : null}
      {code ? (
        <div className="qr-box">
          {img ? <img src={img} alt="Your XENTRA contact QR code" /> : null}
          <span className="qr-code">{code}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={copy}><Copy size={16} /> Copy link</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={regen}><RefreshCw size={16} /> New code</button>
        </div>
      ) : (!err ? <div className="empty pulse">Loading...</div> : null)}
    </Sheet>
  );
}

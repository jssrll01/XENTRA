import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, RefreshCw, Send, X } from 'lucide-react';
import { reserveUpload, sendAttachment } from '../lib/api';
import { uploadChatFile, fmtSize } from '../lib/files';
import { cfg } from '../lib/config';

const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAXDIM = 2048;

const allowed = (f) => {
  const ext = String(f.name || '').split('.').pop().toLowerCase();
  const exts = cfg('image_ext');
  const mimes = cfg('image_mime');
  if (TYPES.indexOf(f.type) < 0) return false;
  if (Array.isArray(exts) && exts.indexOf(ext) < 0) return false;
  if (Array.isArray(mimes) && mimes.indexOf(f.type) < 0) return false;
  return true;
};

async function shrink(file) {
  if (file.type === 'image/gif') return file;
  let bmp = null;
  try { bmp = await createImageBitmap(file); } catch (x) { return null; }
  const big = bmp.width > MAXDIM || bmp.height > MAXDIM || file.size > 1500000;
  if (!big) { bmp.close(); return file; }
  const k = Math.min(1, MAXDIM / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const blob = await new Promise((res) => { c.toBlob(res, 'image/jpeg', 0.82); });
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], String(file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

export default function ImageSend({ conversationId, disabled, onSent, onNotice }) {
  const inp = useRef(null);
  const [sel, setSel] = useState(null);
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => () => { if (sel) URL.revokeObjectURL(sel.url); }, [sel]);

  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!allowed(f)) { onNotice('Only JPEG, PNG, WebP or GIF images are allowed.'); return; }
    const out = await shrink(f);
    if (!out) { onNotice('Could not read that image.'); return; }
    if (!allowed(out)) { onNotice('That image type is not allowed.'); return; }
    const max = Number(cfg('file_max_bytes'));
    if (max && out.size > max) { onNotice('That image is too large. The limit is ' + fmtSize(max) + '.'); return; }
    setErr(''); setPct(0);
    setSel({ file: out, url: URL.createObjectURL(out) });
  };
  const close = () => { if (!busy) setSel(null); };
  const send = async () => {
    setBusy(true); setErr(''); setPct(0);
    const f = sel.file;
    const rs = await reserveUpload(conversationId, f.name, f.type, f.size);
    if (!rs.ok) { setBusy(false); setErr(rs.error); return; }
    const up = await uploadChatFile(rs.data.path, f, setPct);
    if (!up.ok) { setBusy(false); setErr(up.error); return; }
    const s = await sendAttachment(conversationId, rs.data.path, f.name, f.type, f.size, crypto.randomUUID());
    setBusy(false);
    if (!s.ok) { setErr(s.error); return; }
    setSel(null);
    onSent();
  };
  return (
    <>
      <input ref={inp} type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif" onChange={pick} />
      <button type="button" className="icon-btn" aria-label="Send image" disabled={disabled} onClick={() => inp.current && inp.current.click()}><ImageIcon size={20} /></button>
      {sel ? (
        <div className="is-back" role="dialog" aria-modal="true" aria-label="Send image">
          <div className="is-card">
            <img src={sel.url} alt="Selected" />
            <p className="note">{sel.file.name} - {fmtSize(sel.file.size)}</p>
            {busy ? <div className="up-bar"><span style={{ width: pct + '%' }} /></div> : null}
            {err ? <div className="alert err" role="alert">{err}</div> : null}
            <div className="is-acts">
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={close}><X size={16} /> Remove</button>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={send}>{err ? <RefreshCw size={16} /> : <Send size={16} />} {err ? 'Retry' : 'Send'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

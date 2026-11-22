import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import Sheet from './Sheet';

const parse = (t) => {
  const s = String(t || '').trim();
  const m = s.match(/\/add\/([a-z0-9]{6,32})\/?$/i);
  if (m) return m[1].toLowerCase();
  return /^[a-z0-9]{6,32}$/i.test(s) ? s.toLowerCase() : null;
};

export default function ScanSheet({ onClose }) {
  const nav = useNavigate();
  const video = useRef(null);
  const [err, setErr] = useState('');
  const [bad, setBad] = useState('');
  const [manual, setManual] = useState('');
  const go = (code) => { onClose(); nav('/add/' + code); };
  useEffect(() => {
    let stream = null;
    let raf = 0;
    let live = true;
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const tick = () => {
      if (!live) return;
      const v = video.current;
      if (v && v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth) {
        const sc = Math.min(1, 640 / v.videoWidth);
        cv.width = Math.round(v.videoWidth * sc);
        cv.height = Math.round(v.videoHeight * sc);
        ctx.drawImage(v, 0, 0, cv.width, cv.height);
        const img = ctx.getImageData(0, 0, cv.width, cv.height);
        const res = jsQR(img.data, img.width, img.height);
        if (res) {
          const c = parse(res.data);
          if (c) { live = false; go(c); return; }
          setBad('That QR code is not a XENTRA contact code.');
        }
      }
      raf = requestAnimationFrame(tick);
    };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErr('The camera is not available here. Enter a code below.');
      return undefined;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then((s) => {
      if (!live) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      video.current.srcObject = s;
      video.current.play().catch(() => {});
      raf = requestAnimationFrame(tick);
    }).catch(() => setErr('Camera permission was denied. Enter a code below.'));
    return () => { live = false; cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, []);
  const submit = () => {
    const c = parse(manual);
    if (c) go(c); else setBad('Enter a valid contact code or link.');
  };
  return (
    <Sheet title="Scan a code" onClose={onClose}>
      {err ? <div className="alert err">{err}</div> : <video ref={video} className="scan-v" playsInline muted />}
      {bad ? <div className="alert info">{bad}</div> : null}
      <input type="text" placeholder="Or paste a code or link" aria-label="Contact code or link" value={manual} onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
      <button type="button" className="btn btn-primary btn-block" disabled={!manual.trim()} onClick={submit}>Continue</button>
    </Sheet>
  );
}

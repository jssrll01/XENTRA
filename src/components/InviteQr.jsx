import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function InviteQr({ link, alt }) {
  const [img, setImg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(link, { margin: 1, width: 240 })
      .then((u) => { if (live) { setImg(u); setErr(''); } })
      .catch(() => { if (live) setErr('Could not draw the QR code.'); });
    return () => { live = false; };
  }, [link]);
  if (err) return <div className="alert err" role="alert">{err}</div>;
  return img ? <img src={img} width={240} height={240} alt={alt || 'Team invite QR code'} /> : null;
}

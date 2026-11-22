import React from 'react';
import { thumb } from '../../lib/cloudinary';

const PAL = [['#1d4ed8', '#3b82f6'], ['#0d9488', '#2dd4bf'], ['#7c3aed', '#a78bfa'], ['#ea580c', '#fb923c'], ['#be185d', '#f472b6']];
const hash = (s) => { let h = 0; for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

export default function Avatar({ name, url, size = 44, presence }) {
  const [a, b] = PAL[hash(name) % PAL.length];
  const ini = String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: url ? '#e2e8f0' : 'linear-gradient(135deg,' + a + ',' + b + ')' }}>
      {url ? <img src={thumb(url, size * 2)} alt="" /> : ini}
      {presence === 'online' || presence === 'dnd' ? <i className={'pdot ' + presence} /> : null}
    </span>
  );
}

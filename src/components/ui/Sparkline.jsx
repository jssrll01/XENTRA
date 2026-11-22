import React from 'react';

export default function Sparkline({ series = [], color = '#3b82f6' }) {
  const w = 120;
  const h = 40;
  const data = series.length > 1 ? series : [0, 0];
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => [(i * w) / (data.length - 1), h - 4 - (v / max) * (h - 12)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return (
    <svg className="spark" viewBox={'0 0 ' + w + ' ' + h} preserveAspectRatio="none" aria-hidden="true">
      <path d={d + ' L' + w + ' ' + h + ' L0 ' + h + ' Z'} fill={color} opacity=".12" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

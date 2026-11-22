import React, { useId } from 'react';

export default function Sparkline({ series = [], color = '#3b82f6' }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const n = series.length > 1 ? series : [0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(...n, 1);
  const pts = n.map((v, i) => [(i / (n.length - 1)) * 100, 28 - (v / max) * 22]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return (
    <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".28" /><stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={line + ' L100 30 L0 30 Z'} fill={'url(#' + id + ')'} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

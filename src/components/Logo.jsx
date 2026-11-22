import React from 'react';

export function LogoMark({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lm-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d4ed8" /><stop offset="1" stop-color="#3b82f6" /></linearGradient>
        <linearGradient id="lm-b" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b82f6" /><stop offset="1" stop-color="#38bdf8" /></linearGradient>
      </defs>
      <path d="M14 12L50 52" stroke="url(#lm-a)" strokeWidth="11" strokeLinecap="round" />
      <path d="M50 12L14 52" stroke="url(#lm-b)" strokeWidth="11" strokeLinecap="round" />
    </svg>
  );
}

export default function Logo({ size = 40, tagline = true }) {
  return (
    <div className="brand">
      <LogoMark size={size} />
      <div>
        <div className="brand-name">XENTRA</div>
        {tagline ? <div className="brand-tag">One Ecosystem. Every Connection.</div> : null}
      </div>
    </div>
  );
}

import React from 'react';

export function LogoMark({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lm-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1d4ed8" /><stop offset="1" stopColor="#3b82f6" /></linearGradient>
        <linearGradient id="lm-b" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b82f6" /><stop offset="1" stopColor="#38bdf8" /></linearGradient>
      </defs>
      <path d="M14 12L50 52" stroke="url(#lm-a)" strokeWidth="11" strokeLinecap="round" />
      <path d="M50 12L14 52" stroke="url(#lm-b)" strokeWidth="11" strokeLinecap="round" />
    </svg>
  );
}

export function BrandArt({ size = 260 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 260 260" aria-hidden="true">
      <defs>
        <linearGradient id="ba-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1d4ed8" /><stop offset="1" stopColor="#3b82f6" /></linearGradient>
        <linearGradient id="ba-b" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b82f6" /><stop offset="1" stopColor="#38bdf8" /></linearGradient>
        <linearGradient id="ba-r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#93c5fd" /></linearGradient>
      </defs>
      <ellipse cx="130" cy="130" rx="120" ry="70" transform="rotate(-24 130 130)" fill="none" stroke="url(#ba-r)" strokeWidth="3" opacity=".7" />
      <path d="M72 56L188 204" stroke="url(#ba-a)" strokeWidth="42" strokeLinecap="round" />
      <path d="M188 56L72 204" stroke="url(#ba-b)" strokeWidth="42" strokeLinecap="round" />
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

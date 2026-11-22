import React, { useId } from 'react';

function Cross({ id }) {
  return (
    <>
      <defs>
        <linearGradient id={id + 'a'} gradientUnits="userSpaceOnUse" x1="14" y1="12" x2="50" y2="52">
          <stop offset="0" stopColor="#1e40af" /><stop offset="1" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id={id + 'b'} gradientUnits="userSpaceOnUse" x1="14" y1="52" x2="50" y2="12">
          <stop offset="0" stopColor="#38bdf8" /><stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <line x1="14" y1="52" x2="50" y2="12" stroke={'url(#' + id + 'b)'} strokeWidth="13" strokeLinecap="round" />
      <line x1="14" y1="12" x2="50" y2="52" stroke={'url(#' + id + 'a)'} strokeWidth="13" strokeLinecap="round" />
    </>
  );
}

const useUid = () => useId().replace(/[^a-zA-Z0-9]/g, '');

export function LogoMark({ size = 40 }) {
  const id = useUid();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true"><Cross id={id} /></svg>
  );
}

export function BrandArt({ size = 260 }) {
  const id = useUid();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="32" cy="32" rx="30" ry="11" transform="rotate(-28 32 32)" fill="none" stroke="#93c5fd" strokeOpacity=".55" strokeWidth="1.2" />
      <Cross id={id} />
    </svg>
  );
}

export default function Logo({ size = 40, tagline = true }) {
  return (
    <div className="brand">
      <LogoMark size={size} />
      <div>
        <div className="brand-name" style={{ fontSize: Math.round(size * 0.6) }}>XENTRA</div>
        {tagline ? <div className="brand-tag">One Ecosystem. Every Connection.</div> : null}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';

const quick = () => typeof window !== 'undefined' && Boolean(window.matchMedia) && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Keeps an element mounted for ms after open turns false so an exit animation can play.
// Returns { mounted, out }: render when mounted, add the "out" class while out.
export default function useExit(open, ms = 160) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) { setMounted(true); return undefined; }
    if (!mounted) return undefined;
    if (quick()) { setMounted(false); return undefined; }
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return { mounted: open || mounted, out: !open && mounted };
}

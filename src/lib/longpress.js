let timer = 0;
let sx = 0;
let sy = 0;
let fired = false;
const stop = () => { clearTimeout(timer); timer = 0; };

export const pressProps = (onLong, ms = 300) => ({
  onPointerDown: (e) => { if (e.button) return; fired = false; sx = e.clientX; sy = e.clientY; stop(); timer = setTimeout(() => { timer = 0; fired = true; onLong(); }, ms); },
  onPointerMove: (e) => { if (timer && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 12) stop(); },
  onPointerUp: stop,
  onPointerLeave: stop,
  onPointerCancel: stop,
  onClickCapture: (e) => { if (fired) { fired = false; e.preventDefault(); e.stopPropagation(); } },
  onKeyDown: (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onLong(); } },
});

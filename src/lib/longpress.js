let timer = 0;
let sx = 0;
let sy = 0;
const stop = () => { clearTimeout(timer); timer = 0; };

export const pressProps = (onLong) => ({
  onPointerDown: (e) => { if (e.button) return; sx = e.clientX; sy = e.clientY; stop(); timer = setTimeout(() => { timer = 0; onLong(); }, 1000); },
  onPointerMove: (e) => { if (timer && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 12) stop(); },
  onPointerUp: stop,
  onPointerLeave: stop,
  onPointerCancel: stop,
  onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onLong(); } },
});

const SEL = '.avatar-btn, .pop [role="menuitem"], .page-head .btn, button[aria-label^="Notifications"]';
let t = 0;
let st = 0;
let sx = 0;
let sy = 0;
let swallow = false;
const stop = () => { clearTimeout(t); t = 0; };
const pick = (e) => {
  const el = e.target && e.target.closest ? e.target.closest('a,button,label,[role="menuitem"]') : null;
  if (!el || el.disabled) return null;
  const txt = (el.textContent || '').trim();
  if (/^Log out/i.test(txt)) return null;
  return el.matches(SEL) || /^Explore AI tools/i.test(txt) ? el : null;
};
document.addEventListener('pointerdown', (e) => {
  if (e.button) return;
  const el = pick(e);
  stop();
  if (!el) return;
  sx = e.clientX; sy = e.clientY;
  t = setTimeout(() => {
    t = 0;
    el.click();
    swallow = true;
    clearTimeout(st);
    st = setTimeout(() => { swallow = false; }, 1500);
  }, 300);
}, true);
document.addEventListener('pointermove', (e) => { if (t && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 10) stop(); }, true);
const up = () => { stop(); if (swallow) { clearTimeout(st); st = setTimeout(() => { swallow = false; }, 400); } };
document.addEventListener('pointerup', up, true);
document.addEventListener('pointercancel', up, true);
document.addEventListener('click', (e) => { if (swallow) { swallow = false; e.preventDefault(); e.stopPropagation(); } }, true);

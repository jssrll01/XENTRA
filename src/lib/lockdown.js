const stop = (e) => e.preventDefault();
const inField = (e) => { const el = e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentElement; return Boolean(el && el.closest && el.closest('input,textarea,[contenteditable="true"]')); };
document.addEventListener('contextmenu', (e) => { if (!inField(e)) e.preventDefault(); });
document.addEventListener('dragstart', stop);
document.addEventListener('selectstart', (e) => {
  const el = e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentElement;
  if (el && el.closest && el.closest('input,textarea,[contenteditable="true"]')) return;
  e.preventDefault();
});
['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => document.addEventListener(n, stop));
document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '_', '0'].indexOf(e.key) >= 0) e.preventDefault();
});
document.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
// devtools shortcuts: a deterrent only, not security
document.addEventListener('keydown', (e) => {
  const c = e.code;
  const bad = e.key === 'F12'
    || ((e.ctrlKey || e.metaKey) && e.shiftKey && (c === 'KeyI' || c === 'KeyJ' || c === 'KeyC'))
    || (e.ctrlKey && !e.shiftKey && c === 'KeyU')
    || (e.metaKey && e.altKey && (c === 'KeyI' || c === 'KeyJ' || c === 'KeyU'));
  if (bad) { e.preventDefault(); e.stopPropagation(); }
}, true);

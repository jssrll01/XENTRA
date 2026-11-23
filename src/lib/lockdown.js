const stop = (e) => e.preventDefault();
document.addEventListener('contextmenu', stop);
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

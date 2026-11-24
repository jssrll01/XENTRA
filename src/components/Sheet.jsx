import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Sheet({ title, onClose, children }) {
  const box = useRef(null);
  const [out, setOut] = useState(false);
  const timer = useRef(null);
  const request = useCallback(() => {
    if (timer.current) return;
    const quick = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setOut(true);
    timer.current = setTimeout(() => { timer.current = null; setOut(false); onClose(); }, quick ? 0 : 180);
  }, [onClose]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    const prev = document.activeElement;
    if (box.current) box.current.focus();
    return () => { if (prev && prev.focus) prev.focus(); };
  }, []);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') request(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [request]);
  return createPortal(
    <div className={'sheet-back' + (out ? ' out' : '')} onClick={request}>
      <div className="sheet glass" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><b>{title}</b><button type="button" className="icon-btn" aria-label="Close" onClick={request}><X size={20} /></button></div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

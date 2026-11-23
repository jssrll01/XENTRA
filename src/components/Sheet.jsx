import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Sheet({ title, onClose, children }) {
  const box = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    if (box.current) box.current.focus();
    return () => { if (prev && prev.focus) prev.focus(); };
  }, []);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet glass" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><b>{title}</b><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={20} /></button></div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

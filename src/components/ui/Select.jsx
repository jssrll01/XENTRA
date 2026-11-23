import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export default function Select({ value, onChange, disabled, className = '', children, ...rest }) {
  const uid = 'sel' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const btn = useRef(null);
  const list = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [act, setAct] = useState(0);
  const opts = React.Children.toArray(children).filter((c) => c && c.props).map((c) => ({ v: String(c.props.value == null ? '' : c.props.value), t: c.props.children, d: Boolean(c.props.disabled) }));
  const cur = String(value == null ? '' : value);
  const idx = opts.findIndex((o) => o.v === cur);

  const close = useCallback(() => { setOpen(false); if (btn.current) btn.current.focus({ preventScroll: true }); }, []);
  const show = () => {
    if (disabled || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    if (window.matchMedia('(min-width: 768px)').matches) {
      const w = Math.max(r.width, 190);
      const up = window.innerHeight - r.bottom < 260 && r.top > window.innerHeight - r.bottom;
      setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), width: w, top: up ? undefined : r.bottom + 6, bottom: up ? window.innerHeight - r.top + 6 : undefined });
    } else setPos(null);
    setAct(Math.max(0, idx));
    setOpen(true);
  };
  const pick = (o) => { if (o.d) return; if (onChange) onChange({ target: { value: o.v } }); close(); };

  useEffect(() => { if (open && list.current) list.current.focus(); }, [open]);
  useEffect(() => {
    if (!open || !list.current) return;
    const el = list.current.children[act];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [open, act]);
  useEffect(() => {
    if (!open) return undefined;
    const sc = (e) => { if (list.current && list.current.contains(e.target)) return; setOpen(false); };
    const rs = () => setOpen(false);
    window.addEventListener('scroll', sc, true);
    window.addEventListener('resize', rs);
    return () => { window.removeEventListener('scroll', sc, true); window.removeEventListener('resize', rs); };
  }, [open]);

  const key = (e) => {
    const n = opts.length;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') { setOpen(false); return; }
    if (!n) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setAct((a) => (a + 1) % n); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAct((a) => (a - 1 + n) % n); }
    else if (e.key === 'Home') { e.preventDefault(); setAct(0); }
    else if (e.key === 'End') { e.preventDefault(); setAct(n - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (opts[act]) pick(opts[act]); }
  };
  const tkey = (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); show(); } };

  return (
    <>
      <button type="button" {...rest} ref={btn} className={('sel ' + className).trim()} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => (open ? close() : show())} onKeyDown={tkey}>
        <span className="sel-val">{idx >= 0 ? opts[idx].t : ''}</span>
        <ChevronDown size={16} />
      </button>
      {open ? createPortal(
        <div className={'sel-back' + (pos ? ' at' : '')} onClick={close}>
          <ul className={'sel-list' + (pos ? ' at' : '')} ref={list} role="listbox" tabIndex={-1} aria-label={rest['aria-label']} aria-activedescendant={uid + act} style={pos || undefined} onKeyDown={key} onClick={(e) => e.stopPropagation()}>
            {opts.map((o, i) => (
              <li key={o.v + ':' + i} id={uid + i} role="option" aria-selected={o.v === cur} aria-disabled={o.d || undefined} className={'sel-opt' + (i === act ? ' act' : '') + (o.v === cur ? ' on' : '')} onMouseEnter={() => setAct(i)} onClick={() => pick(o)}>
                <span>{o.t}</span>{o.v === cur ? <Check size={16} /> : null}
              </li>
            ))}
          </ul>
        </div>,
        document.body
      ) : null}
    </>
  );
}

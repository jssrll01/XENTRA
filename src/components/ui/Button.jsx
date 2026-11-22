import React from 'react';
import { Loader2 } from 'lucide-react';

export default function Button({ variant = 'primary', icon: Icon, loading, block, className = '', children, ...rest }) {
  return (
    <button {...rest} disabled={loading || rest.disabled} className={['btn', 'btn-' + variant, block ? 'btn-block' : '', className].join(' ').trim()}>
      {loading ? <Loader2 size={18} className="spin" /> : Icon ? <Icon size={18} /> : null}
      {children}
    </button>
  );
}

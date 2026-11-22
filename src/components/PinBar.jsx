import React, { useState } from 'react';
import { Pin } from 'lucide-react';

export default function PinBar({ pins, onJump }) {
  const [i, setI] = useState(0);
  const n = i % pins.length;
  const p = pins[n];
  return (
    <button type="button" className="pinbar" onClick={() => { onJump(p.id); setI(n + 1); }}>
      <Pin size={16} /><span><b>{pins.length > 1 ? 'Pinned ' + (n + 1) + ' of ' + pins.length : 'Pinned message'}</b>{p.body}</span>
    </button>
  );
}

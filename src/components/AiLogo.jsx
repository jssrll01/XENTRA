import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';

export default function AiLogo({ url, size = 40 }) {
  const [bad, setBad] = useState(false);
  const box = { width: size, height: size };
  return (
    <span className="ai-logo" style={box}>
      {url && !bad
        ? <img src={url} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} />
        : <Sparkles size={Math.round(size * 0.5)} />}
    </span>
  );
}

import { useEffect, useState } from 'react';
import { conversationNames } from './api';

const NONE = {};

export default function useNames(id, on) {
  const [names, setNames] = useState(NONE);
  useEffect(() => {
    if (!on) return undefined;
    let live = true;
    conversationNames(id).then((r) => { if (live && r.ok) setNames(r.data || NONE); });
    return () => { live = false; };
  }, [id, on]);
  return on ? names : NONE;
}

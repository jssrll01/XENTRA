import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function InviteResume() {
  const nav = useNavigate();
  useEffect(() => {
    let c = null;
    try {
      c = localStorage.getItem('xentra_invite');
      if (c) localStorage.removeItem('xentra_invite');
    } catch (e) { c = null; }
    if (c) nav('/invite/' + c, { replace: true });
  }, [nav]);
  return null;
}

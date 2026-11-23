import React, { useState } from 'react';
import InviteQr from './InviteQr';

export default function ProfileQr({ username }) {
  const [on, setOn] = useState(false);
  const link = window.location.origin + '/u/' + username;
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" aria-expanded={on} onClick={() => setOn(!on)}>{on ? 'Hide QR code' : 'Show QR code'}</button>
      {on ? <InviteQr link={link} alt="Profile QR code" /> : null}
    </>
  );
}

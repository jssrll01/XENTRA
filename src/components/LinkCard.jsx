import React from 'react';
import { Link2 } from 'lucide-react';

export default function LinkCard({ url }) {
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { host = url; }
  return (
    <a className="linkcard" href={url} target="_blank" rel="noopener noreferrer">
      <Link2 size={18} /><span><b>{host}</b><i>{url}</i></span>
    </a>
  );
}

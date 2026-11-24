import React from 'react';
import { FileText, Send, X } from 'lucide-react';
import { fmtSize } from '../lib/files';

export default function StagedFiles({ items, onRemove, onSend }) {
  if (!items.length) return null;
  return (
    <div className="stg" role="group" aria-label="Files to send">
      {items.map((s) => (
        <div className="stg-row" key={s.key}>
          {s.url ? <img src={s.url} alt="" /> : <FileText size={24} />}
          <span className="stg-t"><b>{s.file.name}</b><span>{fmtSize(s.file.size)}</span></span>
          <button type="button" className="icon-btn" aria-label={'Remove ' + s.file.name} onClick={() => onRemove(s.key)}><X size={18} /></button>
        </div>
      ))}
      <button type="button" className="btn btn-primary btn-sm stg-send" onClick={onSend}><Send size={16} /> {items.length === 1 ? 'Send file' : 'Send ' + items.length + ' files'}</button>
    </div>
  );
}

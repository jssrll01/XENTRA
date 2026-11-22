import React from 'react';

export default function EmptyState({ icon: Icon, title, text }) {
  return (
    <div className="empty">
      {Icon ? <span className="empty-ic"><Icon size={28} /></span> : null}
      <b>{title}</b>
      {text ? <p>{text}</p> : null}
    </div>
  );
}

import React from 'react';

export default function Skeleton({ rows = 3 }) {
  return (
    <div className="sk-list" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div className="sk-row" key={i}>
          <span className="sk sk-av" />
          <div className="sk-lines"><span className="sk sk-l1" /><span className="sk sk-l2" /></div>
        </div>
      ))}
    </div>
  );
}

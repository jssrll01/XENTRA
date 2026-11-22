import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main className="center-page">
      <div className="glass" style={{ padding: 28, maxWidth: 420, width: '100%' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>Page not found</h1>
        <p style={{ margin: '0 0 16px', color: 'var(--muted)' }}>That address does not exist.</p>
        <Link to="/">Back to XENTRA</Link>
      </div>
    </main>
  );
}

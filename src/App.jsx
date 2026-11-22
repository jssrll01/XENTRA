import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Welcome from './pages/Welcome';

function NotFound() {
  return (
    <main className="center-page">
      <div className="glass status-card" style={{ padding: 24, textAlign: 'center' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>Page not found</h1>
        <p style={{ margin: '0 0 16px', color: 'var(--muted)' }}>That address does not exist.</p>
        <Link to="/">Back to XENTRA</Link>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

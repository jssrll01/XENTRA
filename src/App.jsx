import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { configured } from './lib/supabase';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './components/ui/Toast';
import { Root, RequireAuth, PublicOnly } from './components/Guards';
import SignUp from './pages/SignUp';
import SignIn from './pages/SignIn';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import Home from './pages/Home';
import NotFound from './pages/NotFound';

export default function App() {
  if (!configured) {
    return (
      <main className="center-page">
        <div className="glass" style={{ padding: 28, maxWidth: 420 }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>Not configured</h1>
          <p style={{ margin: 0, color: 'var(--muted)' }}>VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing.</p>
        </div>
      </main>
    );
  }
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Root />} />
            <Route path="/signup" element={<PublicOnly><SignUp /></PublicOnly>} />
            <Route path="/signin" element={<PublicOnly><SignIn /></PublicOnly>} />
            <Route path="/verify-email" element={<PublicOnly><VerifyEmail /></PublicOnly>} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/home" element={<RequireAuth><Home /></RequireAuth>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}

import React from 'react';
import { LogOut } from 'lucide-react';
import Logo from '../components/Logo';
import Button from '../components/ui/Button';
import { useAuth } from '../lib/auth';

export default function Home() {
  const { user, signOut } = useAuth();
  const meta = (user && user.user_metadata) || {};
  return (
    <main className="center-page">
      <Logo size={52} />
      <section className="glass" style={{ padding: 28, width: '100%', maxWidth: 420 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 24 }}>Welcome, {meta.first_name || 'there'}.</h1>
        <p style={{ margin: '0 0 20px', color: 'var(--muted)' }}>Signed in as {user && user.email}</p>
        <Button variant="secondary" block icon={LogOut} onClick={signOut}>Sign out</Button>
      </section>
    </main>
  );
}

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { LogoMark } from './Logo';

export function Splash() {
  return <main className="center-page"><div className="pulse"><LogoMark size={64} /></div></main>;
}

export function Root() {
  const { session } = useAuth();
  if (session === undefined) return <Splash />;
  return <Navigate to={session ? '/home' : '/signin'} replace />;
}

export function RequireAuth({ children }) {
  const { session } = useAuth();
  const loc = useLocation();
  if (session === undefined) return <Splash />;
  if (!session) return <Navigate to="/signin" replace state={{ from: loc.pathname }} />;
  return children;
}

export function PublicOnly({ children }) {
  const { session } = useAuth();
  if (session === undefined) return <Splash />;
  if (session) return <Navigate to="/home" replace />;
  return children;
}

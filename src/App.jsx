import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import PublicProfile from './pages/PublicProfile';
import { configured } from './lib/supabase';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './components/ui/Toast';
import { Root, RequireAuth, PublicOnly } from './components/Guards';
import SignUp from './pages/SignUp';
import SignIn from './pages/SignIn';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import Home from './pages/Home';
import Profile from './pages/Profile';
import Notifications from './pages/Notifications';
import Search from './pages/Search';
import Messages from './pages/Messages';
import Chat from './pages/Chat';
import Contacts from './pages/Contacts';
import AddContact from './pages/AddContact';
import InvitePage from './pages/InvitePage';
import InviteResume from './components/InviteResume';
import GroupInfo from './pages/GroupInfo';
import JoinGroup from './pages/JoinGroup';
import Teams from './pages/Teams';
import Settings from './pages/Settings';
import Team from './pages/Team';
import JoinTeam from './pages/JoinTeam';
import AppShell from './components/AppShell';
import { ProfileProvider } from './lib/profile';
import { SummaryProvider } from './lib/summary';
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
            <Route path="/invite/:code" element={<InvitePage />} />
            <Route element={<RequireAuth><ProfileProvider><SummaryProvider><InviteResume /><AppShell /></SummaryProvider></ProfileProvider></RequireAuth>}>
              <Route path="/home" element={<Home />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/search" element={<Search />} />
              <Route path="/u/:username" element={<PublicProfile />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/messages/:id" element={<Chat />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/add/:code" element={<AddContact />} />
              <Route path="/groups/:id/info" element={<GroupInfo />} />
              <Route path="/join/:code" element={<JoinGroup />} />
              <Route path="/teams" element={<Teams />} />
              <Route path="/teams/:id" element={<Team />} />
              <Route path="/t/:code" element={<JoinTeam />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}

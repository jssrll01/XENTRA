import React from 'react';
import { MessageCircle, Users, Zap } from 'lucide-react';
import Logo, { BrandArt } from './Logo';

const FEATS = [
  [MessageCircle, 'Connect Instantly', 'Message your team and friends'],
  [Users, 'Collaborate Seamlessly', 'Work together in teams and channels'],
  [Zap, 'Be More Productive', 'Get more done with XENTRA'],
];

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth">
      <header className="auth-top"><Logo size={40} /></header>
      <div className="auth-art"><BrandArt size={220} /></div>
      <aside className="auth-brand">
        <Logo size={48} />
        <div>
          <h2>Stay connected with <span>everyone</span> who matters.</h2>
          <p>A powerful workspace for messaging, contacts and teams.</p>
          {FEATS.map(([Icon, t, s]) => (
            <div className="feat" key={t}>
              <span className="feat-ic"><Icon size={22} /></span>
              <div><b>{t}</b><span>{s}</span></div>
            </div>
          ))}
        </div>
        <div className="brand-art-lg"><BrandArt size={320} /></div>
        <div className="foot" style={{ position: 'relative' }}>Powered by XMARKET</div>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <h1>{title}</h1>
          {subtitle ? <p className="sub">{subtitle}</p> : null}
          {children}
          {footer ? <div className="auth-foot">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}

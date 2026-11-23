import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { acceptInvite } from '../lib/api';
import { Splash } from '../components/Guards';

export default function InvitePage() {
  const { code } = useParams();
  const { session } = useAuth();
  const [res, setRes] = useState(null);
  const ran = useRef(false);
  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      try { localStorage.setItem('xentra_invite', code); } catch (e) { /* storage unavailable */ }
      return;
    }
    if (ran.current) return;
    ran.current = true;
    (async () => { setRes(await acceptInvite(code)); })();
  }, [session, code]);
  if (session === undefined) return <Splash />;
  return (
    <main className="center-page">
      <section className="glass card pf-pub">
        {!session ? (
          <>
            <h2>You are invited to XENTRA</h2>
            <p className="note">Create an account or sign in. Your invite is applied automatically.</p>
            <div className="pf-acts">
              <Link className="btn btn-primary btn-sm" to="/signup">Create account</Link>
              <Link className="btn btn-secondary btn-sm" to="/signin">Sign in</Link>
            </div>
          </>
        ) : null}
        {session && !res ? <p className="note">Applying your invite...</p> : null}
        {session && res && res.ok ? (
          <>
            <h2>{res.data && res.data.already ? 'You are already connected' : 'Contact request sent'}</h2>
            <p className="note">{res.data && res.data.already ? 'This person is already in your contacts.' : 'They will see your request in Contacts.'}</p>
            <div className="pf-acts"><Link className="btn btn-primary btn-sm" to="/contacts">Open Contacts</Link></div>
          </>
        ) : null}
        {session && res && !res.ok ? (
          <>
            <h2>Invite not applied</h2>
            <div className="alert err">{res.error}</div>
            <div className="pf-acts"><Link className="btn btn-secondary btn-sm" to="/home">Go to Home</Link></div>
          </>
        ) : null}
      </section>
    </main>
  );
}

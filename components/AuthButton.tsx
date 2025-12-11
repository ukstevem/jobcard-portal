'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Session = Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'];

export default function AuthButton() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let subscribed = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!subscribed) return;
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!subscribed) return;
      setSession(newSession);
    });

    return () => {
      subscribed = false;
      subscription.unsubscribe();
    };
  }, []);


  // Allows SSO and no login challenge after initital login/out

  // async function handleLogin() {
  //   // Azure provider must be enabled in Supabase Auth settings
  //   await supabase.auth.signInWithOAuth({
  //     provider: 'azure',
  //     options: {
  //       redirectTo: `${window.location.origin}/dashboard`,
  //     },
  //   });
  // }

  // Forces login challenge after initital login/out

  async function handleLogin() {
  await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      redirectTo: `${window.location.origin}/dashboard`,
      queryParams: {
        // 'select_account' = always show the account chooser
        // Use 'login' if you want to force re-entering credentials every time
        prompt: 'select_account',
      },
    },
  });
}


  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (loading) return <button disabled>Checking login...</button>;

  if (!session) {
    return (
      <button onClick={handleLogin}>
        Sign in with Azure
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <span>Signed in as {session.user.email}</span>
      <button onClick={handleLogout}>Sign out</button>
    </div>
  );
}

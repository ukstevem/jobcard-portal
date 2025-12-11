'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import AuthButton from '@/components/AuthButton';
import JobcardList from '@/components/JobcardList';
import WhoAmI from '@/components/WhoAmI';



export default function DashboardPage() {
  const [checking, setChecking] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    let subscribed = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!subscribed) return;
      setLoggedIn(!!data.session);
      setChecking(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!subscribed) return;
      setLoggedIn(!!session);
    });

    return () => {
      subscribed = false;
      subscription.unsubscribe();
    };
  }, []);

  if (checking) return <p>Checking auth…</p>;

  if (!loggedIn) {
    return (
      <main style={{ padding: '2rem' }}>
        <h1>Dashboard</h1>
        <p>You must be signed in to view jobcards.</p>
        <AuthButton />
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem' }}>
      <h1>Dashboard</h1>
      <AuthButton />
      <WhoAmI />
      <JobcardList />
    </main>
  );
}

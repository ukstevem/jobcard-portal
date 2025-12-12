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

  if (checking) {
    return (
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="rounded-xl border bg-white shadow-sm p-6 text-sm text-slate-600">
          Checking your session…
        </div>
      </main>
    );
  }

  if (!loggedIn) {
    return (
      <main className="max-w-xl mx-auto px-6 py-16">
        <div className="rounded-2xl border bg-white shadow-sm p-8 space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight">Site jobcard portal</h1>
          <p className="text-sm text-slate-600">
            Sign in with your company account to view projects, jobcards and WBS.
          </p>
          <div className="pt-2">
            <AuthButton />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-600">
            Select a project item to drill into its WBS and jobcards.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <AuthButton />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[2fr,1fr]">
        <div className="rounded-2xl border bg-white shadow-sm p-4 md:p-6">
          <JobcardList />
        </div>
      </div>
    </main>
  );
}

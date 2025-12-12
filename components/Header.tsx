// components/Header.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type UserInfo = {
  id: string;
  email: string | null;
};

export function Header() {
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error('getUser error', error);
        setUser(null);
        return;
      }
      if (data.user) {
        setUser({
          id: data.user.id,
          email: data.user.email ?? null,
        });
      } else {
        setUser(null);
      }
    };
    loadUser();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <header className="w-full border-b px-6 py-3 flex items-center justify-between">
      <div className="font-semibold">
        Site Jobcards
      </div>

      <div className="flex flex-col items-end gap-1 text-xs">
        {user ? (
          <>
            <div className="text-gray-700">
              Signed in as <span className="font-medium">{user.email ?? user.id}</span>
            </div>
            <div className="font-mono text-[10px] text-gray-400 break-all">
              uid: {user.id}
            </div>
          </>
        ) : (
          <div className="text-gray-500">Not signed in</div>
        )}

        <button
          onClick={handleSignOut}
          className="mt-1 rounded-md border px-3 py-1 text-xs hover:bg-gray-50"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

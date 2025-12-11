'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function WhoAmI() {
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUid() {
      const { data, error } = await supabase.rpc('auth_whoami');
      if (error) {
        setError(error.message);
      } else {
        setUid(data);
      }
    }

    fetchUid();
  }, []);

  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (!uid) return <p>Loading auth.uid()…</p>;

  return <p>auth.uid() = {uid}</p>;
}

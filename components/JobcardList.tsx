'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Jobcard = {
  id: string;
  title?: string | null;
  description?: string | null;
  // add other fields if you like
};

export default function JobcardList() {
  const [jobcards, setJobcards] = useState<Jobcard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let subscribed = true;

    async function fetchJobcards() {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('jobcard_jobs')   // <-- CHANGE to your actual table
        .select('*')
        .order('id', { ascending: true });

      if (!subscribed) return;

      if (error) {
        setError(error.message);
        setJobcards([]);
      } else {
        setJobcards(data || []);
      }

      setLoading(false);
    }

    fetchJobcards();

    return () => {
      subscribed = false;
    };
  }, []);

  if (loading) return <p>Loading jobcards…</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  if (jobcards.length === 0) {
    return <p>No jobcards returned. Check RLS and user mapping.</p>;
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <h2>Your jobcards</h2>
      <ul>
        {jobcards.map((j) => (
          <li key={j.id}>
            <strong>{j.title || `Jobcard ${j.id}`}</strong>
            {j.description && <div>{j.description}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

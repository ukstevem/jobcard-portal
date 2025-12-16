import AuthButton from "@/components/AuthButton";
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabase } from '@/lib/supabaseClient';

export default async function HomePage() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // If already signed in (including immediately after OAuth callback), go straight to dashboard
  if (session) redirect("/dashboard");

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>Jobcard Portal (Auth Test)</h1>
      <p>Use Azure login, then open the dashboard to test RLS.</p>

      <AuthButton />

      <p style={{ marginTop: "1rem" }}>
        After signing in, go to <Link href="/dashboard">Dashboard</Link>.
      </p>
    </main>
  );
}

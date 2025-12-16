// components/Header.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type UserInfo = {
  id: string;
  email: string | null;
  fullName: string | null;
};

export function Header() {
  const pathname = usePathname();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isSuperuser, setIsSuperuser] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const clearUser = () => {
      setUser(null);
      setIsSuperuser(false);
    };

    const loadForUserId = async (userId: string, email: string | null, meta: any) => {
      // Profile row (optional)
      const { data: profile, error: profErr } = await supabase
        .from("auth_users")
        .select("full_name,email")
        .eq("id", userId)
        .maybeSingle();

      if (profErr) console.error("auth_users profile load failed", profErr);

      const metaName = meta?.full_name ?? meta?.name ?? null;
      const fullName = profile?.full_name?.trim() || (typeof metaName === "string" ? metaName.trim() : null) || null;

      if (!cancelled) {
        setUser({
          id: userId,
          email: email ?? profile?.email ?? null,
          fullName,
        });
      }

      // Superuser check (only when signed in)
      const { data: su, error: suErr } = await supabase.rpc("jobcard_is_superuser");
      if (suErr) {
        console.error("jobcard_is_superuser rpc failed", suErr);
        if (!cancelled) setIsSuperuser(false);
        return;
      }
      if (!cancelled) setIsSuperuser(!!su);
    };

    const loadUserAndRole = async () => {
      const { data, error } = await supabase.auth.getUser();

      if (cancelled) return;

      if (error || !data.user) {
        if (error) console.error("getUser error", error);
        clearUser();
        return;
      }

      await loadForUserId(data.user.id, data.user.email ?? null, data.user.user_metadata);
    };

    // Initial load
    loadUserAndRole();

    // Keep header synced after login/logout
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        clearUser();
        return;
      }
      void loadForUserId(session.user.id, session.user.email ?? null, session.user.user_metadata);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const homeHref = "/dashboard";
  const adminHref = "/admin/project-access-admin";

  const homeActive = pathname === homeHref;
  const adminActive = pathname === adminHref;

  const showNav = !!user; // only show nav when signed in

  return (
    <header className="w-full border-b px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="font-semibold">Site Jobcards</div>

        {showNav ? (
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href={homeHref}
              className={[
                "rounded-md border px-3 py-1",
                homeActive ? "bg-gray-100" : "hover:bg-gray-50",
              ].join(" ")}
            >
              Home
            </Link>

            {isSuperuser ? (
              <Link
                href={adminHref}
                className={[
                  "rounded-md border px-3 py-1",
                  adminActive ? "bg-gray-100" : "hover:bg-gray-50",
                ].join(" ")}
              >
                Admin
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>

      <div className="flex flex-col items-end gap-1 text-xs">
        {user ? (
          <div className="text-gray-700">
            Signed in as{" "}
            <span className="font-medium">
              {user.fullName ?? user.email ?? "User"}
            </span>
          </div>
        ) : (
          <div className="text-gray-500">Not signed in</div>
        )}

        {/* Hide Sign out unless signed in */}
        {user ? (
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-1 rounded-md border px-3 py-1 text-xs hover:bg-gray-50"
          >
            Sign out
          </button>
        ) : null}
      </div>
    </header>
  );
}

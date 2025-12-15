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
    const loadUserAndRole = async () => {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        if (error) console.error("getUser error", error);
        setUser(null);
        setIsSuperuser(false);
        return;
      }

      // Load profile (self row) for full_name
      const { data: profile, error: profErr } = await supabase
        .from("auth_users")
        .select("full_name,email")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profErr) console.error("auth_users profile load failed", profErr);

      const metaName =
        (data.user.user_metadata as any)?.full_name ??
        (data.user.user_metadata as any)?.name ??
        null;

      const fullName =
        profile?.full_name?.trim() ||
        metaName?.trim() ||
        null;

      setUser({
        id: data.user.id,
        email: data.user.email ?? profile?.email ?? null,
        fullName,
      });

      // superuser check (RPC)
      const { data: su, error: suErr } = await supabase.rpc("jobcard_is_superuser");
      if (suErr) {
        console.error("jobcard_is_superuser rpc failed", suErr);
        setIsSuperuser(false);
        return;
      }
      setIsSuperuser(!!su);
    };

    loadUserAndRole();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const homeHref = "/dashboard";
  const adminHref = "/admin/project-access-admin";

  const homeActive = pathname === homeHref;
  const adminActive = pathname === adminHref;

  return (
    <header className="w-full border-b px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="font-semibold">Site Jobcards</div>

        {/* Minimal navbar: only show if superuser */}
        {isSuperuser ? (
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

            <Link
              href={adminHref}
              className={[
                "rounded-md border px-3 py-1",
                adminActive ? "bg-gray-100" : "hover:bg-gray-50",
              ].join(" ")}
            >
              Admin
            </Link>
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Role = "none" | "member" | "manager" | "admin";

type Project = {
  projectnumber: string;
  projectdescription: string | null;
};

type AuthUser = {
  user_id: string; // <- comes from auth_users.id (aliased in the select)
  email: string | null;
  full_name: string | null;
  display_name: string | null;
};

function formatProjectNumber(pn: string) {
  return pn.length === 4 ? `0${pn}` : pn; // 9999 -> 09999, 10001 stays 10001
}

export default function ProjectAccessAdminPage() {
  const [loading, setLoading] = useState(true);

  // gate
  const [authChecked, setAuthChecked] = useState(false);
  const [isSuperuser, setIsSuperuser] = useState(false);

  // data
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [memberMap, setMemberMap] = useState<Record<string, Role>>({});
  const [savingProject, setSavingProject] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");

  // 1) Superuser-only gate (blocks direct URL access)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        window.location.href = "/";
        return;
      }

      const { data: su, error: suErr } = await supabase.rpc("jobcard_is_superuser");
      if (suErr) {
        console.error("jobcard_is_superuser rpc failed", suErr);
        setIsSuperuser(false);
        setAuthChecked(true);
        return;
      }

      setIsSuperuser(!!su);
      setAuthChecked(true);
    })();
  }, []);

  // 2) Load users/projects ONLY if superuser
  
  useEffect(() => {
    if (!authChecked || !isSuperuser) return;

    (async () => {

      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      console.log("auth user:", user?.id, userErr);
      setLoading(true);

      // USERS: alias id -> user_id (your table has `id`, not `user_id`)
      const { data: u, error: uErr } = await supabase
        .from("auth_users")
        .select("user_id:id,email,full_name,display_name")
        .order("email", { ascending: true });

      if (uErr) {
        console.error("auth_users error", uErr);
        setUsers([]);
        setSelectedUserId("");
      } else {
        const rows = (u ?? []) as AuthUser[];
        setUsers(rows);
        const me = rows.find(r => r.user_id === user?.id)?.user_id;
        setSelectedUserId(me ?? rows[0]?.user_id ?? "");
      }

      // PROJECTS (alias client_id -> projectdescription)
      const { data: p, error: pErr } = await supabase.rpc("jobcard_list_projects");
      if (pErr) {
        console.error("project_register error", pErr);
        setProjects([]);
      } else {
        setProjects((p ?? []) as Project[]);
      }

      setLoading(false);
    })();
  }, [authChecked, isSuperuser]);

  // 3) Load membership for selected user
  useEffect(() => {
    if (!authChecked || !isSuperuser) return;

    if (!selectedUserId) {
      setMemberMap({});
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from("jobcard_project_members")
        .select("projectnumber,role")
        .eq("user_id", selectedUserId);

      if (error) {
        console.error("jobcard_project_members error", error);
        setMemberMap({});
        return;
      }

      const next: Record<string, Role> = {};
      for (const row of data ?? []) next[row.projectnumber] = (row.role as Role) ?? "member";
      setMemberMap(next);
    })();
  }, [authChecked, isSuperuser, selectedUserId]);

  const visibleProjects = useMemo(() => {
    const f = filter.trim().toLowerCase();

    const filtered = !f
      ? projects
      : projects.filter(
          (p) =>
            (p.projectnumber ?? "").toLowerCase().includes(f) ||
            (p.projectdescription ?? "").toLowerCase().includes(f)
        );

    // FIX: correct comparator order + numeric ascending
    return [...filtered].sort((a, b) => {
      const an = parseInt(a.projectnumber, 10);
      const bn = parseInt(b.projectnumber, 10);

      if (!Number.isNaN(an) && !Number.isNaN(bn)) return bn - an;
      return a.projectnumber.localeCompare(b.projectnumber);
    });
  }, [projects, filter]);

  const setRole = async (projectnumber: string, role: Role) => {
    if (!selectedUserId) return;

    setSavingProject((s) => ({ ...s, [projectnumber]: true }));

    try {
      if (role === "none") {
        const { error } = await supabase
          .from("jobcard_project_members")
          .delete()
          .eq("user_id", selectedUserId)
          .eq("projectnumber", projectnumber);

        if (error) throw error;

        setMemberMap((m) => {
          const copy = { ...m };
          delete copy[projectnumber];
          return copy;
        });
      } else {
        const { error } = await supabase
          .from("jobcard_project_members")
          .upsert(
            { user_id: selectedUserId, projectnumber, role },
            { onConflict: "projectnumber,user_id" }
          );

        if (error) throw error;

        setMemberMap((m) => ({ ...m, [projectnumber]: role }));
      }
    } catch (e: any) {
      console.error("setRole failed", {
        message: e?.message,
        details: e?.details,
        hint: e?.hint,
        code: e?.code,
      });
      alert("Save failed (RLS or permissions). Check console + policies.");
    } finally {
      setSavingProject((s) => ({ ...s, [projectnumber]: false }));
    }
  };

  // Gate render
  if (!authChecked) return <div className="p-6">Checking permissions…</div>;

  if (!isSuperuser) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Not authorised</h1>
        <p className="text-sm text-gray-600 mt-1">This page is for superusers only.</p>
      </div>
    );
  }

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Project access</h1>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1">
          <label className="block text-sm mb-1">User</label>
          <select
            className="w-full border rounded px-3 py-2"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
          >
            <option value="">Select a user…</option>
            {users.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {(u.full_name ?? u.display_name ?? "").trim() || u.email || u.user_id}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label className="block text-sm mb-1">Filter projects</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search project no / description…"
          />
        </div>
      </div>

      {!selectedUserId ? (
        <div className="text-sm text-gray-600">Pick a user to edit access.</div>
      ) : (
        <div className="overflow-auto border rounded">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="text-left p-2">Project</th>
                <th className="text-left p-2">Description</th>
                <th className="text-center p-2 w-20">None</th>
                <th className="text-center p-2 w-20">User</th>
                <th className="text-center p-2 w-24">Manager</th>
                <th className="text-center p-2 w-20">Admin</th>
              </tr>
            </thead>

            <tbody>
              {visibleProjects.map((p) => {
                const current = memberMap[p.projectnumber] ?? "none";
                const saving = !!savingProject[p.projectnumber];

                const rowClass =
                  current === "admin"
                    ? "bg-green-50"
                    : current === "manager"
                      ? "bg-blue-50"
                      : current === "member"
                        ? "bg-gray-50"
                        : "";

                const radioName = `role-${selectedUserId}-${p.projectnumber}`;

                return (
                  <tr key={p.projectnumber} className={`border-t ${rowClass}`}>
                    <td className="p-2 font-mono">{formatProjectNumber(p.projectnumber)}</td>
                    <td className="p-2">{p.projectdescription ?? ""}</td>

                    {(["none", "member", "manager", "admin"] as Role[]).map((r) => (
                      <td key={r} className="p-2 text-center">
                        <label className="inline-flex items-center justify-center cursor-pointer">
                          <input
                            type="radio"
                            name={radioName}
                            className="h-4 w-4"
                            checked={current === r}
                            disabled={saving}
                            onChange={() => setRole(p.projectnumber, r)}
                            aria-label={`${formatProjectNumber(p.projectnumber)} set role ${r}`}
                          />
                        </label>
                      </td>
                    ))}

                    <td className="p-2">
                      {saving ? <span className="text-xs text-gray-500">Saving…</span> : null}
                    </td>
                  </tr>
                );
              })}

              {visibleProjects.length === 0 ? (
                <tr>
                  <td className="p-3 text-gray-600" colSpan={7}>
                    No projects match.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

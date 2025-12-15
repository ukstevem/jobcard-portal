"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type UserRow = { user_id: string; email: string | null; full_name: string | null };
type ProjectRow = { projectnumber: string; client_id: string | null };
type MemberRow = { projectnumber: string; role: "member" | "manager" | "admin"; user_id: string };

const ROLE_OPTIONS = ["none", "member", "manager", "admin"] as const;
type RoleOption = typeof ROLE_OPTIONS[number];

export default function ProjectAccessAdmin({
  users,
  projects,
}: {
  users: UserRow[];
  projects: ProjectRow[];
}) {
  const [selectedUserId, setSelectedUserId] = useState<string>(users[0]?.user_id ?? "");
  const [membership, setMembership] = useState<Record<string, RoleOption>>({});
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!selectedUserId) return;

    (async () => {
      const { data, error } = await supabase
        .from("jobcard_project_members")
        .select("projectnumber, role, user_id")
        .eq("user_id", selectedUserId);

      if (error) {
        console.error(error);
        setMembership({});
        return;
      }

      const map: Record<string, RoleOption> = {};
      (data as MemberRow[]).forEach((m) => (map[m.projectnumber] = m.role));
      setMembership(map);
    })();
  }, [selectedUserId]);

  const filteredProjects = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.projectnumber.toLowerCase().includes(q) ||
        (p.client_id ?? "").toLowerCase().includes(q)
    );
  }, [filter, projects]);

  async function setRole(projectnumber: string, role: RoleOption) {
    if (!selectedUserId) return;

    // optimistic UI
    setMembership((prev) => {
      const next = { ...prev };
      if (role === "none") delete next[projectnumber];
      else next[projectnumber] = role;
      return next;
    });

    if (role === "none") {
      const { error } = await supabase
        .from("jobcard_project_members")
        .delete()
        .eq("projectnumber", projectnumber)
        .eq("user_id", selectedUserId);

      if (error) console.error(error);
      return;
    }

    const { error } = await supabase
      .from("jobcard_project_members")
      .upsert(
        { projectnumber, user_id: selectedUserId, role },
        { onConflict: "projectnumber,user_id" }
      );

    if (error) console.error(error);
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>Project access</h1>

      <div style={{ display: "grid", gap: 8, maxWidth: 520 }}>
        <label>
          User
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          >
            {users.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {(u.full_name ? `${u.full_name} — ` : "") + (u.email ?? u.user_id)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Filter projects
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search by projectnumber or client"
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Project
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Client
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Role
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredProjects.map((p) => {
              const role = membership[p.projectnumber] ?? "none";
              return (
                <tr key={p.projectnumber}>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>
                    {p.projectnumber}
                  </td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>
                    {p.client_id ?? ""}
                  </td>
                  <td style={{ borderBottom: "1px solid #f0f0f0", padding: 8 }}>
                    <select
                      value={role}
                      onChange={(e) => setRole(p.projectnumber, e.target.value as RoleOption)}
                      style={{ padding: 6 }}
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

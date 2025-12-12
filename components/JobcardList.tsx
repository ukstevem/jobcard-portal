'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type ProjectMembership = {
  projectnumber: string;
  role: string;
};

type ProjectItem = {
  id: string;
  projectnumber: string;
  item_seq: number;
  line_desc: string;
};

export default function JobcardList() {
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [rolesByProject, setRolesByProject] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchItems() {
      setLoading(true);
      setError(null);

      // 1) Project memberships for this user
      const { data: memberships, error: memError } = await supabase
        .from('jobcard_project_members')
        .select('projectnumber, role')
        .order('projectnumber');

      if (!isMounted) return;

      if (memError) {
        setError(memError.message);
        setItems([]);
        setLoading(false);
        return;
      }

      const memberProjects = (memberships || []) as ProjectMembership[];

      if (memberProjects.length === 0) {
        setItems([]);
        setRolesByProject({});
        setLoading(false);
        return;
      }

      const projectnumbers = memberProjects.map((m) => m.projectnumber);
      const roleMap: Record<string, string> = {};
      for (const m of memberProjects) {
        roleMap[m.projectnumber] = m.role;
      }
      setRolesByProject(roleMap);

      // 2) Items for those projects
      const { data: itemRows, error: itemsError } = await supabase
        .from('project_register_items')
        .select('id, projectnumber, item_seq, line_desc')
        .in('projectnumber', projectnumbers)
        .order('projectnumber', { ascending: true })
        .order('item_seq', { ascending: true });

      if (!isMounted) return;

      if (itemsError) {
        setError(itemsError.message);
        setItems([]);
      } else {
        setItems((itemRows || []) as ProjectItem[]);
      }

      setLoading(false);
    }

    fetchItems();

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="text-sm text-slate-600">
        Loading project items…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-3">
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-2">
        <h2 className="text-base font-semibold">Project items</h2>
        <p className="text-sm text-slate-600">
          You’re not a member of any projects yet. Add a row in{' '}
          <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">
            jobcard_project_members
          </code>{' '}
          for your <code className="font-mono text-xs">auth.uid()</code> to start
          seeing items.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Project items</h2>
          <p className="text-xs text-slate-500">
            Click through to manage WBS and jobcards for each item.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-xs text-slate-500 uppercase tracking-wide">
                Project
              </th>
              <th className="text-left px-4 py-2 font-medium text-xs text-slate-500 uppercase tracking-wide">
                Item
              </th>
              <th className="text-left px-4 py-2 font-medium text-xs text-slate-500 uppercase tracking-wide">
                Description
              </th>
              <th className="text-left px-4 py-2 font-medium text-xs text-slate-500 uppercase tracking-wide">
                Role
              </th>
              <th className="text-right px-4 py-2 font-medium text-xs text-slate-500 uppercase tracking-wide">
                Open
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const itemCode = `${it.projectnumber}-${String(it.item_seq).padStart(
                2,
                '0'
              )}`;
              const role = rolesByProject[it.projectnumber] ?? 'member';

              return (
                <tr
                  key={it.id}
                  className="border-b last:border-b-0 hover:bg-slate-50/60"
                >
                  <td className="px-4 py-2 align-top">
                    <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">
                      {it.projectnumber}
                    </span>
                  </td>
                  <td className="px-4 py-2 align-top font-mono text-xs">
                    {String(it.item_seq).padStart(2, '0')}
                  </td>
                  <td className="px-4 py-2 align-top">
                    <div className="text-sm">{it.line_desc}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      WBS base: {itemCode}
                    </div>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide">
                      {role}
                    </span>
                  </td>
                  <td className="px-4 py-2 align-top text-right">
                    <Link
                      href={`/dashboard/${it.projectnumber}/${it.item_seq}`}
                      className="inline-flex items-center rounded-full border px-3 py-1 text-xs hover:bg-slate-900 hover:text-white transition-colors"
                    >
                      Open WBS
                    </Link>
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

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

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

type TaskRow = { projectnumber: string; item_seq: number | string | null };

function keyOf(projectnumber: string, itemSeq: number) {
  return `${projectnumber}:${itemSeq}`;
}

function buildCountMap(tasks: TaskRow[]) {
  const map: Record<string, number> = {};
  for (const t of tasks) {
    const pn = t.projectnumber;
    const seqNum = Number(t.item_seq);
    if (!pn || !Number.isFinite(seqNum)) continue;
    const k = keyOf(pn, seqNum);
    map[k] = (map[k] ?? 0) + 1;
  }
  return map;
}

export default function JobcardList() {
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [rolesByProject, setRolesByProject] = useState<Record<string, string>>({});
  const [jobcardCounts, setJobcardCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function openWbs(projectnumber: string, itemSeq: number) {
    if (!projectnumber || !Number.isFinite(itemSeq)) return;
    router.push(`/dashboard/${encodeURIComponent(projectnumber)}/${itemSeq}`);
  }

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
        setJobcardCounts({});
        setLoading(false);
        return;
      }

      const memberProjects = (memberships || []) as ProjectMembership[];
      if (memberProjects.length === 0) {
        setItems([]);
        setRolesByProject({});
        setJobcardCounts({});
        setLoading(false);
        return;
      }

      const projectnumbers = Array.from(new Set(memberProjects.map((m) => m.projectnumber)));
      const roleMap: Record<string, string> = {};
      for (const m of memberProjects) roleMap[m.projectnumber] = m.role;
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
        setJobcardCounts({});
        setLoading(false);
        return;
      }

      const loadedItems = (itemRows || []) as ProjectItem[];
      setItems(loadedItems);

      // 3) Jobcard counts (projectnumber + item_seq)
      const { data: taskRows, error: taskError } = await supabase
        .from('jobcard_tasks')
        .select('projectnumber, item_seq')
        .in('projectnumber', projectnumbers);

      if (!isMounted) return;

      if (taskError) {
        setError(taskError.message);
        setJobcardCounts({});
        setLoading(false);
        return;
      }

      setJobcardCounts(buildCountMap((taskRows || []) as TaskRow[]));
      setLoading(false);
    }

    fetchItems();
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return <div className="text-sm text-slate-600">Loading project items…</div>;
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
          for your <code className="font-mono text-xs">auth.uid()</code> to start seeing items.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Project items</h2>
          <p className="text-xs text-slate-500">Click through to manage WBS and jobcards for each item.</p>
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
                Description
              </th>
              <th className="text-center px-4 py-2 font-medium text-xs text-slate-500 uppercase tracking-wide">
                Jobcards
              </th>
            </tr>
          </thead>

          <tbody>
            {items.map((it) => {
              const itemCode = `${it.projectnumber}-${String(it.item_seq).padStart(2, '0')}`;
              const totalJobcards = jobcardCounts[keyOf(it.projectnumber, it.item_seq)] ?? 0;

              return (
                <tr
                  key={it.id}
                  onClick={() => openWbs(it.projectnumber, it.item_seq)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openWbs(it.projectnumber, it.item_seq);
                    }
                  }}
                  role="link"
                  tabIndex={0}
                  className="border-b last:border-b-0 hover:bg-slate-50/60 cursor-pointer"
                >
                  <td className="px-4 py-2 align-top">
                    <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">
                      {it.projectnumber}
                    </span>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <div className="text-sm">{it.line_desc}</div>
                    <div className="text-xs text-slate-500 mt-0.5">WBS base: {itemCode}</div>
                  </td>
                  <td className="px-4 py-2 align-top text-center font-mono text-xs">{totalJobcards}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

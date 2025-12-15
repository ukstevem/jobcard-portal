'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type ProjectItem = {
  projectnumber: string;
  item_seq: number;
  line_desc: string;
};

type WbsNode = {
  id: string;
  projectnumber: string;
  item_seq: number;
  parent_id: string | null;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
};

type JobcardTask = {
  id: string;
  projectnumber: string;
  item_seq: number;
  wbs_node_id: string;
  title: string;
  description: string | null;
  status: string;
  qr_slug: string | null;
  created_at?: string | null;
};

type ProjectRole = 'member' | 'manager' | 'admin' | null;

/* ---------- helpers ---------- */

/** id -> full WBS path, e.g. 10305-01-01-02 */
function buildPathMap(nodes: WbsNode[], baseCode: string): Record<string, string> {
  const map = new Map<string, WbsNode>();
  nodes.forEach((n) => map.set(n.id, n));

  const pathMap: Record<string, string> = {};

  const resolve = (id: string): string => {
    if (pathMap[id]) return pathMap[id];
    const node = map.get(id);
    if (!node) return baseCode;

    let parentPath = baseCode;
    if (node.parent_id) {
      parentPath = resolve(node.parent_id);
    }
    const full = `${parentPath}-${node.code}`;
    pathMap[id] = full;
    return full;
  };

  nodes.forEach((n) => resolve(n.id));
  return pathMap;
}

/* ---------- inline jobcard create form ---------- */

function AddJobcardInlineForm({
  projectnumber,
  itemSeq,
  nodes,
  pathMap,
  selectedNode,
  onCreated,
  onClose,
}: {
  projectnumber: string;
  itemSeq: number;
  nodes: WbsNode[];
  pathMap: Record<string, string>;
  selectedNode: WbsNode | null;
  onCreated: (task: JobcardTask) => void;
  onClose: () => void;
}) {
  const initialId = selectedNode?.id || (nodes.length > 0 ? nodes[0].id : '');
  const [selectedNodeId, setSelectedNodeId] = useState<string>(initialId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFixedNode = !!selectedNode;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedNodeId) {
      setError('Please choose a WBS node.');
      return;
    }

    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    const node = nodes.find((n) => n.id === selectedNodeId);
    if (!node) {
      setError('Selected WBS node not found.');
      return;
    }

    setSaving(true);
    setError(null);

    const randomPart = Math.random().toString(36).slice(2, 8);
    const qrSlug = `${projectnumber}-${String(itemSeq).padStart(
      2,
      '0'
    )}-${node.code}-${randomPart}`.toLowerCase();

    const { data, error: insertError } = await supabase
      .from('jobcard_tasks')
      .insert({
        projectnumber,
        item_seq: itemSeq,
        wbs_node_id: node.id,
        title: title.trim(),
        description: description.trim() || null,
        status: 'planned',
        qr_slug: qrSlug,
      })
      .select(
        'id, projectnumber, item_seq, wbs_node_id, title, description, status, qr_slug, created_at'
      )
      .maybeSingle<JobcardTask>();

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    if (data) {
      onCreated(data);
      setTitle('');
      setDescription('');
      onClose();
    }

    setSaving(false);
  };

  const wbsOptions = nodes.map((n) => ({
    value: n.id,
    label: `${pathMap[n.id] ?? ''} — ${n.name}`,
  }));

  const fixedPath = selectedNode ? pathMap[selectedNode.id] : '';

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-xl border bg-slate-50 px-3 py-3 text-xs space-y-2"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold text-slate-700">
          New jobcard
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="text-[11px] text-slate-500 hover:text-slate-900"
        >
          Cancel
        </button>
      </div>

      <div className="space-y-1">
        <div className="text-[11px] font-medium text-slate-600">WBS node</div>
        {hasFixedNode && selectedNode ? (
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 text-white px-2 py-0.5 text-[10px]">
            <span className="font-mono">{fixedPath}</span>
            <span className="text-[10px] opacity-80">{selectedNode.name}</span>
          </div>
        ) : (
          <select
            className="block w-full rounded-md border px-2 py-1 text-xs"
            value={selectedNodeId}
            onChange={(e) => setSelectedNodeId(e.target.value)}
          >
            {wbsOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <label className="block text-[11px] font-medium text-slate-600">
        Title
        <input
          className="mt-1 block w-full rounded-md border px-2 py-1 text-xs"
          placeholder="Jobcard title (e.g. Fabricate main beams)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <label className="block text-[11px] font-medium text-slate-600">
        Description{' '}
        <span className="font-normal text-slate-400">(optional)</span>
        <textarea
          className="mt-1 block w-full rounded-md border px-2 py-1 text-xs min-h-[50px]"
          placeholder="Optional description / scope for this jobcard"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      {error && (
        <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="text-[11px] px-3 py-1 rounded-full border border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Create jobcard'}
        </button>
      </div>
    </form>
  );
}

/* ---------- inline jobcard edit form ---------- */

function EditJobcardInlineForm({
  task,
  wbsPath,
  onUpdated,
  onClose,
}: {
  task: JobcardTask;
  wbsPath: string;
  onUpdated: (task: JobcardTask) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    setSaving(true);
    setError(null);

    const { data, error: updateError } = await supabase
      .from('jobcard_tasks')
      .update({
        title: title.trim(),
        description: description.trim() || null,
      })
      .eq('id', task.id)
      .select(
        'id, projectnumber, item_seq, wbs_node_id, title, description, status, qr_slug, created_at'
      )
      .maybeSingle<JobcardTask>();

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    if (data) {
      onUpdated(data);
      onClose();
    }

    setSaving(false);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-xl border bg-slate-50 px-3 py-3 text-xs space-y-2"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-slate-700">
            Edit jobcard
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-slate-900 text-white px-2 py-0.5 text-[10px]">
            <span className="font-mono">{wbsPath}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="text-[11px] text-slate-500 hover:text-slate-900"
        >
          Cancel
        </button>
      </div>

      <label className="block text-[11px] font-medium text-slate-600">
        Title
        <input
          className="mt-1 block w-full rounded-md border px-2 py-1 text-xs"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <label className="block text-[11px] font-medium text-slate-600">
        Description <span className="font-normal text-slate-400">(optional)</span>
        <textarea
          className="mt-1 block w-full rounded-md border px-2 py-1 text-xs min-h-[50px]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      {error && (
        <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="text-[11px] px-3 py-1 rounded-full border border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

/* ---------- WBS tree (with full WBS path + selection) ---------- */

type WbsTreeProps = {
  nodes: WbsNode[];
  pathMap: Record<string, string>;
  baseCode: string;
  rootParentId: string | null;
  selectedWbsPath: string;
  onSelectPath: (path: string) => void;
};

function WbsTree({
  nodes,
  pathMap,
  baseCode,
  rootParentId,
  selectedWbsPath,
  onSelectPath,
}: WbsTreeProps) {
  const nodesByParent = useMemo(() => {
    const map = new Map<string | null, WbsNode[]>();
    for (const node of nodes) {
      const key = node.parent_id;
      const arr = map.get(key) ?? [];
      arr.push(node);
      map.set(key, arr);
    }
    for (const [key, arr] of map.entries()) {
      arr.sort((a, b) =>
        a.code.localeCompare(b.code, undefined, { numeric: true })
      );
      map.set(key, arr);
    }
    return map;
  }, [nodes]);

  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderNode = (node: WbsNode) => {
    const children = nodesByParent.get(node.id) ?? [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedNodes[node.id] ?? true;
    const wbsPath = pathMap[node.id] ?? baseCode;
    const selected = selectedWbsPath === wbsPath;

    const rowClasses = [
      'flex items-center gap-2 py-1.5 pr-2 rounded-xl cursor-pointer',
      selected ? 'bg-slate-900/5 ring-1 ring-slate-300' : 'hover:bg-slate-50',
    ].join(' ');

    const pillClasses = [
      'inline-flex items-center gap-2 rounded-full px-2 py-0.5 text-[10px] border',
      selected
        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
        : 'bg-slate-50 text-slate-800 border-slate-300',
    ].join(' ');

    return (
      <div key={node.id} className="border-l border-slate-200 pl-3 md:pl-4">
        <div
          className={rowClasses}
          onClick={() => onSelectPath(wbsPath)}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleNode(node.id);
              }}
              className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-[10px] leading-none"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? '−' : '+'}
            </button>
          ) : (
            <div className="h-5 w-5" />
          )}

          <div className={pillClasses}>
            <span className="font-mono">{wbsPath}</span>
          </div>

          <span className="text-xs text-slate-700 truncate">{node.name}</span>
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1">
            {children.map((child) => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  const rootNodes = nodesByParent.get(rootParentId) ?? [];
  const rootSelected = selectedWbsPath === baseCode;

  return (
    <div className="space-y-2">
      {/* Visible root representing 10305-01 etc */}
      <button
        type="button"
        onClick={() => onSelectPath(baseCode)}
        className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-[11px] border ${
          rootSelected
            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
            : 'bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100'
        }`}
      >
        <span className="font-mono text-[11px]">{baseCode}</span>
        <span className="text-[11px]">
          Root (project item)
        </span>
      </button>

      {rootNodes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          No WBS structure yet. Start by adding a WBS node.
        </div>
      ) : (
        rootNodes.map((node) => renderNode(node))
      )}
    </div>
  );
}

/* ---------- Jobcard list (filtered by selected WBS) ---------- */

function JobcardList({
  tasks,
  pathMap,
  selectedWbsPath,
  baseCode,
  canEdit,
  onEdit,
  onDelete,
  onOpen,
}: {
  tasks: JobcardTask[];
  pathMap: Record<string, string>;
  selectedWbsPath: string;
  baseCode: string;
  canEdit: boolean;
  onEdit: (task: JobcardTask) => void;
  onDelete: (task: JobcardTask) => void;
  onOpen: (task: JobcardTask) => void;
}) {
  if (!tasks.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        No jobcards yet. Create one when you’re ready to define site work.
      </div>
    );
  }

  const tasksWithPath = tasks.map((t) => {
    const wbsPath = pathMap[t.wbs_node_id] ?? baseCode;
    return { ...t, wbsPath };
  });

  const filtered = tasksWithPath.filter((t) =>
    t.wbsPath.startsWith(selectedWbsPath)
  );

  const total = tasksWithPath.length;
  const count = filtered.length;

  if (!count) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        No jobcards under <span className="font-mono">{selectedWbsPath}</span>.
      </div>
    );
  }

  const sorted = filtered.sort((a, b) => {
    if (a.wbsPath === b.wbsPath) {
      return (a.created_at || '').localeCompare(b.created_at || '');
    }
    return a.wbsPath.localeCompare(b.wbsPath, undefined, { numeric: true });
  });

  return (
    <div className="space-y-2 mt-2">
      <div className="text-[11px] text-slate-500">
        Showing <span className="font-semibold">{count}</span> of{' '}
        <span className="font-semibold">{total}</span> jobcards under{' '}
        <span className="font-mono">{selectedWbsPath}</span>.
      </div>

      {sorted.map((task) => {
        const statusLabel = (task.status || 'planned').toLowerCase();

        return (
          <div
            key={task.id}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs cursor-pointer hover:bg-slate-50"
            onClick={() => onOpen(task)}
          >
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-slate-900 text-white px-2 py-0.5 text-[10px] font-mono">
                  {task.wbsPath}
                </span>
                <span
                  className={`inline-flex h-2 w-2 rounded-full ${
                    statusLabel === 'complete'
                      ? 'bg-emerald-500'
                      : statusLabel === 'in_progress'
                      ? 'bg-amber-500'
                      : 'bg-slate-400'
                  }`}
                />
                {task.qr_slug ? (
                  <Link
                    href={`/jobcard/${task.qr_slug}`}
                    className="truncate font-medium text-slate-800 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {task.title}
                  </Link>
                ) : (
                  <span className="truncate font-medium text-slate-800">
                    {task.title}
                  </span>
                )}
              </div>
              {task.description && (
                <p className="text-[11px] text-slate-600 line-clamp-2">
                  {task.description}
                </p>
              )}
            </div>

            <div className="ml-3 flex flex-col items-end gap-1 text-[10px] text-slate-500">
              {task.created_at && (
                <div>{new Date(task.created_at).toLocaleDateString()}</div>
              )}
              <div className="capitalize">
                {statusLabel.replace('_', ' ')}
              </div>
              {canEdit && (
                <div className="flex gap-1 mt-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(task);
                    }}
                    className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] hover:bg-slate-100"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(task);
                    }}
                    className="rounded-full border border-red-300 px-2 py-0.5 text-[10px] text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Add WBS node form (create) ---------- */

function AddWbsNodeForm({
  projectnumber,
  itemSeq,
  nodes,
  pathMap,
  baseCode,
  canEdit,
  role,
  onCreated,
  onClose,
}: {
  projectnumber: string;
  itemSeq: number;
  nodes: WbsNode[];
  pathMap: Record<string, string>;
  baseCode: string;
  canEdit: boolean;
  role: ProjectRole;
  onCreated: (node: WbsNode) => void;
  onClose: () => void;
}) {
  const [parentId, setParentId] = useState<string | ''>('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) {
    return (
      <div className="rounded-xl border bg-slate-50 px-4 py-3 text-xs text-slate-600">
        You are signed in with role <strong>{role ?? 'member'}</strong> on this project.
        WBS is read-only. Ask a manager or admin if you need to change it.
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    const normalizedParentId: string | null = parentId || null;
    const siblings = nodes.filter(
      (n) => (n.parent_id ?? null) === normalizedParentId
    );

    const nextCode = String(siblings.length + 1).padStart(2, '0');
    const existingSorts = siblings
      .map((s) => s.sort_order)
      .filter((v) => Number.isFinite(v));
    const nextSort = existingSorts.length ? Math.max(...existingSorts) + 10 : 10;

    const { data, error: insertError } = await supabase
      .from('jobcard_wbs_nodes')
      .insert({
        projectnumber,
        item_seq: itemSeq,
        parent_id: normalizedParentId,
        code: nextCode,
        name: name.trim(),
        description: description.trim() || null,
        sort_order: nextSort,
      })
      .select(
        'id, projectnumber, item_seq, parent_id, code, name, description, sort_order'
      )
      .maybeSingle<WbsNode>();

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    if (data) {
      onCreated(data);
      setName('');
      setDescription('');
      onClose();
    }

    setSaving(false);
  };

  const parentOptions = [
    { value: '', label: `${baseCode} (root)` },
    ...nodes.map((n) => ({
      value: n.id,
      label: `${pathMap[n.id]} — ${n.name}`,
    })),
  ];

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border bg-slate-50 px-4 py-3 space-y-3 text-sm mt-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Add WBS node</h3>
          <p className="text-[11px] text-slate-500">
            Nodes can be top-level (under {baseCode}) or nested under existing nodes.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="text-[11px] text-slate-500 hover:text-slate-900"
        >
          Cancel
        </button>
      </div>

      <div className="space-y-2">
        <label className="block text-[11px] font-medium text-slate-600">
          Parent
          <select
            className="mt-1 block w-full rounded-md border px-2 py-1 text-xs"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            {parentOptions.map((opt) => (
              <option key={opt.value || 'root'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-[11px] font-medium text-slate-600">
          Name
          <input
            className="mt-1 block w-full rounded-md border px-2 py-1 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Fabrication, Erection, Preliminaries"
          />
        </label>

        <label className="block text-[11px] font-medium text-slate-600">
          Description <span className="font-normal text-slate-400">(optional)</span>
          <textarea
            className="mt-1 block w-full rounded-md border px-2 py-1 text-sm min-h-[60px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Additional detail about this WBS node."
          />
        </label>
      </div>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium hover:bg-slate-900 hover:text-white disabled:opacity-60 transition-colors"
        >
          {saving ? 'Saving…' : 'Add node'}
        </button>
      </div>
    </form>
  );
}

/* ---------- Edit WBS node form (update) ---------- */

function EditWbsNodeForm({
  node,
  pathMap,
  baseCode,
  canEdit,
  role,
  onUpdated,
  onClose,
}: {
  node: WbsNode;
  pathMap: Record<string, string>;
  baseCode: string;
  canEdit: boolean;
  role: ProjectRole;
  onUpdated: (node: WbsNode) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(node.name);
  const [description, setDescription] = useState(node.description || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) {
    return (
      <div className="rounded-xl border bg-slate-50 px-4 py-3 text-xs text-slate-600">
        You are signed in with role <strong>{role ?? 'member'}</strong> on this project.
        WBS is read-only. Ask a manager or admin if you need to change it.
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    const { data, error: updateError } = await supabase
      .from('jobcard_wbs_nodes')
      .update({
        name: name.trim(),
        description: description.trim() || null,
      })
      .eq('id', node.id)
      .select(
        'id, projectnumber, item_seq, parent_id, code, name, description, sort_order'
      )
      .maybeSingle<WbsNode>();

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    if (data) {
      onUpdated(data);
      onClose();
    }

    setSaving(false);
  };

  const levelPath = pathMap[node.id] ?? baseCode;
  const parentPath =
    node.parent_id && pathMap[node.parent_id]
      ? pathMap[node.parent_id]
      : baseCode;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border bg-slate-50 px-4 py-3 space-y-3 text-sm mt-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Edit WBS node</h3>
          <p className="text-[11px] text-slate-500">
            Level{' '}
            <span className="font-mono bg-slate-900 text-white px-1 py-0.5 rounded">
              {levelPath}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="text-[11px] text-slate-500 hover:text-slate-900"
        >
          Cancel
        </button>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-medium text-slate-600">
          Parent (read-only)
        </div>
        <div className="text-[11px] text-slate-700">
          <span className="font-mono bg-slate-100 px-1 py-0.5 rounded">
            {parentPath}
          </span>
        </div>

        <label className="block text-[11px] font-medium text-slate-600 mt-2">
          Name
          <input
            className="mt-1 block w-full rounded-md border px-2 py-1 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Fabrication, Erection, Preliminaries"
          />
        </label>

        <label className="block text-[11px] font-medium text-slate-600">
          Description <span className="font-normal text-slate-400">(optional)</span>
          <textarea
            className="mt-1 block w-full rounded-md border px-2 py-1 text-sm min-h-[60px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Additional detail about this WBS node."
          />
        </label>
      </div>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium hover:bg-slate-900 hover:text-white disabled:opacity-60 transition-colors"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

/* ---------- main client component ---------- */

export default function ProjectItemClient({
  projectnumber,
  itemSeq,
}: {
  projectnumber: string;
  itemSeq: number;
}) {
  const router = useRouter();

  const paddedItem = String(itemSeq).padStart(2, '0');
  const baseCode = `${projectnumber}-${paddedItem}`;

  const [item, setItem] = useState<ProjectItem | null>(null);
  const [nodes, setNodes] = useState<WbsNode[]>([]);
  const [tasks, setTasks] = useState<JobcardTask[]>([]);
  const [role, setRole] = useState<ProjectRole>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showJobcardForm, setShowJobcardForm] = useState(false);
  const [showWbsForm, setShowWbsForm] = useState(false);
  const [editingNode, setEditingNode] = useState<WbsNode | null>(null);
  const [editingJobcard, setEditingJobcard] = useState<JobcardTask | null>(null);

  const [selectedWbsPath, setSelectedWbsPath] = useState<string>(baseCode);

  const wbsSectionRef = useRef<HTMLDivElement | null>(null);
  const wbsFormRef = useRef<HTMLDivElement | null>(null);
  const jobcardFormRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelectedWbsPath(baseCode);
  }, [baseCode]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      console.groupCollapsed(`[WBS load] ${projectnumber} / itemSeq=${itemSeq}`);
      console.log('inputs', { projectnumber, itemSeq });
      console.log('isFinite(itemSeq)?', Number.isFinite(itemSeq));

      const userRes = await supabase.auth.getUser();
      const user = userRes.data?.user ?? null;

      const [itemRes, wbsRes, tasksRes, memberRes] = await Promise.all([
        supabase
          .from('project_register_items')
          .select('projectnumber, item_seq, line_desc')
          .eq('projectnumber', projectnumber)
          .eq('item_seq', itemSeq)
          .maybeSingle<ProjectItem>(),

        supabase
          .from('jobcard_wbs_nodes')
          .select('id, projectnumber, item_seq, parent_id, code, name, description, sort_order')
          .eq('projectnumber', projectnumber)
          .eq('item_seq', itemSeq)
          .order('sort_order', { ascending: true }),

        supabase
          .from('jobcard_tasks')
          .select('id, projectnumber, item_seq, wbs_node_id, title, description, status, qr_slug, created_at')
          .eq('projectnumber', projectnumber)
          .eq('item_seq', itemSeq)
          .order('created_at', { ascending: true }),

        // ✅ membership must be per-user, not “any member on the project”
        user
          ? supabase
              .from('jobcard_project_members')
              .select('role')
              .eq('projectnumber', projectnumber)
              .eq('user_id', user.id)
              .maybeSingle<{ role: string }>()
          : Promise.resolve({ data: null as any, error: null as any }),
      ]);


      console.log('memberRes', memberRes);

      
      if (!alive) return;

      const { data: itemData, error: itemError } = itemRes;
      const { data: wbsData, error: wbsError } = wbsRes;
      const { data: taskData, error: tasksError } = tasksRes;
      const { data: memberData, error: memberError } = memberRes;

      if (itemError || wbsError || tasksError || memberError) {
        setError(
          itemError?.message ||
            wbsError?.message ||
            tasksError?.message ||
            memberError?.message ||
            'Unknown error'
        );
        setItem(null);
        setNodes([]);
        setTasks([]);
        setRole(null);
        setLoading(false);
        return;
      }

      setItem(itemData ?? null);
      setNodes((wbsData || []) as WbsNode[]);
      setTasks((taskData || []) as JobcardTask[]);
      setRole((memberData?.role as ProjectRole) ?? null);
      setLoading(false);

    console.groupEnd();
    };

    load();

    return () => {
      alive = false;
    };
  }, [projectnumber, itemSeq]);

  // Scroll effects
  useEffect(() => {
    if ((showJobcardForm || editingJobcard) && jobcardFormRef.current) {
      jobcardFormRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, [showJobcardForm, editingJobcard]);

  useEffect(() => {
    if (showWbsForm && wbsFormRef.current) {
      wbsFormRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, [showWbsForm]);

  const canEdit = role === 'manager' || role === 'admin';

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="rounded-xl border bg-white shadow-sm p-4 text-sm text-slate-600">
          Loading WBS and jobcards…
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        <Link
          href="/dashboard"
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          ← Back to dashboard
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-semibold mb-1">Error loading WBS</div>
          <div>{error}</div>
        </div>
      </main>
    );
  }

  if (!item) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        <Link
          href="/dashboard"
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          ← Back to dashboard
        </Link>
        <div className="rounded-xl border bg-white shadow-sm p-4 text-sm text-slate-700">
          Project item not found.
        </div>
      </main>
    );
  }

  const pathMap = buildPathMap(nodes, baseCode);
  const selectedNode =
    nodes.find((n) => pathMap[n.id] === selectedWbsPath) ?? null;

  const selectedNodeHasTasks = selectedNode
    ? tasks.some((t) => t.wbs_node_id === selectedNode.id)
    : false;

  const selectedNodeHasChildren = selectedNode
    ? nodes.some((n) => n.parent_id === selectedNode.id)
    : false;

  const canDeleteSelectedNode =
    canEdit && !!selectedNode && !selectedNodeHasTasks && !selectedNodeHasChildren;

  const handleCloseJobcardForm = () => {
    setShowJobcardForm(false);
    setEditingJobcard(null);
    if (wbsSectionRef.current) {
      wbsSectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  };

  const handleCloseWbsForm = () => {
    setShowWbsForm(false);
    setEditingNode(null);
    if (wbsSectionRef.current) {
      wbsSectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  };

  const handleDeleteSelectedNode = async () => {
    if (!selectedNode || !canDeleteSelectedNode) return;

    const levelPath = pathMap[selectedNode.id] ?? baseCode;
    const confirmText = `Delete WBS level ${levelPath}? This cannot be undone.`;

    if (typeof window !== 'undefined' && !window.confirm(confirmText)) {
      return;
    }

    const parentPath =
      selectedNode.parent_id && pathMap[selectedNode.parent_id]
        ? pathMap[selectedNode.parent_id]
        : baseCode;

    const { error: deleteError } = await supabase
      .from('jobcard_wbs_nodes')
      .delete()
      .eq('id', selectedNode.id);

    if (deleteError) {
      if (typeof window !== 'undefined') {
        window.alert(`Failed to delete WBS node: ${deleteError.message}`);
      }
      return;
    }

    setNodes((prev) => prev.filter((n) => n.id !== selectedNode.id));
    setSelectedWbsPath(parentPath);
    setShowWbsForm(false);
    setEditingNode(null);
  };

  const handleOpenJobcard = (task: JobcardTask) => {
    if (!task.qr_slug) return;
    router.push(`/jobcard/${task.qr_slug}`);
  };

  const handleEditJobcard = (task: JobcardTask) => {
    setShowJobcardForm(false);
    setEditingJobcard(task);
  };

  const handleDeleteJobcard = async (task: JobcardTask) => {
    const confirmText = `Delete jobcard "${task.title}"? This cannot be undone.`;

    if (typeof window !== 'undefined' && !window.confirm(confirmText)) {
      return;
    }

    const { error: deleteError } = await supabase
      .from('jobcard_tasks')
      .delete()
      .eq('id', task.id);

    if (deleteError) {
      if (typeof window !== 'undefined') {
        window.alert(`Failed to delete jobcard: ${deleteError.message}`);
      }
      return;
    }

    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    if (editingJobcard && editingJobcard.id === task.id) {
      setEditingJobcard(null);
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link
            href="/dashboard"
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            ← Back to dashboard
          </Link>
          <h1 className="mt-2 text-xl font-semibold">
            {projectnumber}-{paddedItem}
          </h1>
          <p className="text-sm text-slate-600">{item.line_desc}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1.4fr,1.6fr]">
        {/* WBS panel */}
        <section
          ref={wbsSectionRef}
          className="rounded-2xl border bg-white shadow-sm p-4 md:p-6 space-y-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">WBS structure</h2>
              <p className="text-xs text-slate-500">
                Select a WBS level to filter jobcards. Root shows all jobcards for{' '}
                <span className="font-mono">{baseCode}</span>.
              </p>
            </div>
            {canEdit && (
              <div className="flex flex-col items-end gap-1 text-[11px]">
                <div className="flex flex-wrap justify-end gap-2">
                  {selectedNode && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNode(selectedNode);
                          setShowWbsForm(true);
                        }}
                        className="rounded-full border border-slate-300 px-3 py-1 text-[11px] text-slate-800 hover:bg-slate-100"
                      >
                        Edit level
                      </button>
                      <button
                        type="button"
                        disabled={!canDeleteSelectedNode}
                        onClick={handleDeleteSelectedNode}
                        className="rounded-full border px-3 py-1 text-[11px] hover:bg-red-50 disabled:opacity-40 border-red-300 text-red-700"
                      >
                        Delete level
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingNode(null);
                      setShowWbsForm(true);
                    }}
                    className="rounded-full border border-slate-900 px-3 py-1 text-[11px] text-slate-900 hover:bg-slate-900 hover:text-white"
                  >
                    New WBS node
                  </button>
                </div>
                {selectedNode &&
                  !canDeleteSelectedNode &&
                  (selectedNodeHasChildren || selectedNodeHasTasks) && (
                    <div className="text-[10px] text-slate-500 text-right">
                      {selectedNodeHasChildren
                        ? 'Cannot delete: has child WBS levels.'
                        : 'Cannot delete: has jobcards attached.'}
                    </div>
                  )}
              </div>
            )}
          </div>

          <WbsTree
            nodes={nodes}
            pathMap={pathMap}
            baseCode={baseCode}
            rootParentId={null}
            selectedWbsPath={selectedWbsPath}
            onSelectPath={setSelectedWbsPath}
          />

          {canEdit && showWbsForm && (
            <div ref={wbsFormRef}>
              {editingNode ? (
                <EditWbsNodeForm
                  node={editingNode}
                  pathMap={pathMap}
                  baseCode={baseCode}
                  canEdit={canEdit}
                  role={role}
                  onUpdated={(updated) =>
                    setNodes((prev) =>
                      prev.map((n) => (n.id === updated.id ? updated : n))
                    )
                  }
                  onClose={handleCloseWbsForm}
                />
              ) : (
                <AddWbsNodeForm
                  projectnumber={projectnumber}
                  itemSeq={itemSeq}
                  nodes={nodes}
                  pathMap={pathMap}
                  baseCode={baseCode}
                  canEdit={canEdit}
                  role={role}
                  onCreated={(node) => setNodes((prev) => [...prev, node])}
                  onClose={handleCloseWbsForm}
                />
              )}
            </div>
          )}
        </section>

        {/* Jobcards panel */}
        <section className="rounded-2xl border bg-white shadow-sm p-4 md:p-6 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Jobcards</h2>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span>Current filter:</span>
                <span className="inline-flex items-center rounded-full bg-slate-900 text-white px-2 py-0.5 text-[10px] font-mono">
                  {selectedWbsPath}
                </span>
              </div>
            </div>
            {canEdit && (
              <button
                type="button"
                disabled={!nodes.length}
                onClick={() => {
                  setEditingJobcard(null);
                  setShowJobcardForm(true);
                }}
                className="rounded-full border border-slate-300 px-3 py-1 text-[11px] text-slate-800 hover:bg-slate-100 disabled:opacity-40"
              >
                New jobcard at level
              </button>
            )}
          </div>

          {!nodes.length && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Create at least one WBS node before adding jobcards.
            </div>
          )}

          {canEdit && (showJobcardForm || editingJobcard) && nodes.length > 0 && (
            <div ref={jobcardFormRef}>
              {editingJobcard ? (
                <EditJobcardInlineForm
                  task={editingJobcard}
                  wbsPath={pathMap[editingJobcard.wbs_node_id] ?? baseCode}
                  onUpdated={(updated) =>
                    setTasks((prev) =>
                      prev.map((t) => (t.id === updated.id ? updated : t))
                    )
                  }
                  onClose={handleCloseJobcardForm}
                />
              ) : (
                <AddJobcardInlineForm
                  projectnumber={projectnumber}
                  itemSeq={itemSeq}
                  nodes={nodes}
                  pathMap={pathMap}
                  selectedNode={selectedNode}
                  onCreated={(task) => setTasks((prev) => [...prev, task])}
                  onClose={handleCloseJobcardForm}
                />
              )}
            </div>
          )}

          <JobcardList
            tasks={tasks}
            pathMap={pathMap}
            selectedWbsPath={selectedWbsPath}
            baseCode={baseCode}
            canEdit={canEdit}
            onEdit={handleEditJobcard}
            onDelete={handleDeleteJobcard}
            onOpen={handleOpenJobcard}
          />
        </section>
      </div>
    </main>
  );
}

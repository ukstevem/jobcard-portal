'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'react-qr-code';
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
};

type JobcardTask = {
  id: string;
  projectnumber: string;
  item_seq: number;
  wbs_node_id: string;
  title: string;
  description: string | null;
  status: string | null;
  qr_slug: string | null;
  created_at?: string | null;
};

type ProjectRole = 'member' | 'manager' | 'admin' | null;

// HSE types aligned with your schema
type HseTopic = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  regulatory_ref?: string | null;
};

type HseQuestion = {
  id: string;
  topic_id: string;
  question_text: string;
  response_type: string;
  required: boolean;
  sort_order: number;
};

type HseResponse = {
  id: string;
  task_id: string;
  question_id: string;
  response_value: string | null;
  responder_name: string | null;
  responder_id: string | null;
  responded_at: string | null;
};

type TaskHseChecklist = {
  topic: HseTopic;
  questions: (HseQuestion & { response?: HseResponse | null })[];
};

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

function buildChecklist(
  allTopics: HseTopic[],
  allQuestions: HseQuestion[],
  attachedTopicIds: string[],
  responses: HseResponse[]
): TaskHseChecklist[] {
  if (!attachedTopicIds.length) return [];

  const attachedSet = new Set(attachedTopicIds);

  const responsesByQuestionId = new Map<string, HseResponse>();
  for (const r of responses) {
    responsesByQuestionId.set(r.question_id, r);
  }

  const questionsByTopic = new Map<string, HseQuestion[]>();
  for (const q of allQuestions) {
    const arr = questionsByTopic.get(q.topic_id) ?? [];
    arr.push(q);
    questionsByTopic.set(q.topic_id, arr);
  }

  const topicsToShow = allTopics.filter((t) => attachedSet.has(t.id));

  return topicsToShow.map((topic) => ({
    topic,
    questions: (questionsByTopic.get(topic.id) ?? []).map((q) => ({
      ...q,
      response: responsesByQuestionId.get(q.id) ?? null,
    })),
  }));
}

export default function JobcardClient({ qrSlug }: { qrSlug: string }) {
  const [task, setTask] = useState<JobcardTask | null>(null);
  const [item, setItem] = useState<ProjectItem | null>(null);
  const [nodes, setNodes] = useState<WbsNode[]>([]);
  const [role, setRole] = useState<ProjectRole>(null);

  const [allTopics, setAllTopics] = useState<HseTopic[]>([]);
  const [allQuestions, setAllQuestions] = useState<HseQuestion[]>([]);
  const [responses, setResponses] = useState<HseResponse[]>([]);
  const [attachedTopicIds, setAttachedTopicIds] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<TaskHseChecklist[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // topic toggling state
  const [topicSavingId, setTopicSavingId] = useState<string | null>(null);
  const [topicError, setTopicError] = useState<string | null>(null);

  // checklist answer state
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [responderName, setResponderName] = useState('');
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const canEdit = role === 'manager' || role === 'admin';
  const canFill = role !== null; // any project member can fill HSE responses

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      // 1) Look up the jobcard by qr_slug
      const { data: taskData, error: taskError } = await supabase
        .from('jobcard_tasks')
        .select('*')
        .eq('qr_slug', qrSlug)
        .maybeSingle();

      if (!alive) return;

      if (taskError || !taskData) {
        setError(taskError?.message || 'Jobcard not found.');
        setTask(null);
        setItem(null);
        setNodes([]);
        setRole(null);
        setAllTopics([]);
        setAllQuestions([]);
        setResponses([]);
        setAttachedTopicIds([]);
        setLoading(false);
        return;
      }

      const taskRow = taskData as JobcardTask;
      setTask(taskRow);

      const projectnumber = taskRow.projectnumber;
      const itemSeq = taskRow.item_seq;
      const taskId = taskRow.id;

      // 2) Load item, WBS nodes, membership role, HSE topic links, responses, topics, questions
      const [
        itemRes,
        nodesRes,
        memberRes,
        taskTopicsRes,
        responsesRes,
        allTopicsRes,
        allQuestionsRes,
      ] = await Promise.all([
        supabase
          .from('project_register_items')
          .select('*')
          .eq('projectnumber', projectnumber)
          .eq('item_seq', itemSeq)
          .maybeSingle(),
        supabase
          .from('jobcard_wbs_nodes')
          .select('*')
          .eq('projectnumber', projectnumber)
          .eq('item_seq', itemSeq),
        supabase
          .from('jobcard_project_members')
          .select('role')
          .eq('projectnumber', projectnumber)
          .maybeSingle(),
        supabase
          .from('jobcard_task_hse_topics')
          .select('topic_id')
          .eq('task_id', taskId),
        supabase
          .from('jobcard_task_hse_responses')
          .select('*')
          .eq('task_id', taskId),
        supabase
          .from('jobcard_hse_topics')
          .select('*')
          .order('code', { ascending: true }),
        supabase
          .from('jobcard_hse_questions')
          .select('*')
          .order('topic_id', { ascending: true })
          .order('sort_order', { ascending: true }),
      ]);

      if (!alive) return;

      const { data: itemData, error: itemError } = itemRes;
      const { data: nodesData, error: nodesError } = nodesRes;
      const { data: memberData, error: memberError } = memberRes;
      const { data: taskTopicRows, error: ttError } = taskTopicsRes;
      const { data: responseRows, error: responsesError } = responsesRes;
      const { data: topicsData, error: topicsError } = allTopicsRes;
      const { data: questionsData, error: questionsError } = allQuestionsRes;

      if (
        itemError ||
        nodesError ||
        memberError ||
        ttError ||
        responsesError ||
        topicsError ||
        questionsError
      ) {
        setError(
          itemError?.message ||
            nodesError?.message ||
            memberError?.message ||
            ttError?.message ||
            responsesError?.message ||
            topicsError?.message ||
            questionsError?.message ||
            'Error loading jobcard details.'
        );
        setItem(null);
        setNodes([]);
        setRole(null);
        setAllTopics([]);
        setAllQuestions([]);
        setResponses([]);
        setAttachedTopicIds([]);
        setLoading(false);
        return;
      }

      setItem(itemData ?? null);
      setNodes((nodesData || []) as WbsNode[]);
      setRole((memberData?.role as ProjectRole) ?? null);

      const topicIds = (taskTopicRows || []).map((row) => row.topic_id as string);
      const topics = (topicsData || []) as HseTopic[];
      const questions = (questionsData || []) as HseQuestion[];
      const resp = (responseRows || []) as HseResponse[];

      setAllTopics(topics);
      setAllQuestions(questions);
      setResponses(resp);
      setAttachedTopicIds(topicIds);
      setLoading(false);
    };

    load();

    return () => {
      alive = false;
    };
  }, [qrSlug]);

  // Rebuild checklist whenever topics/questions/attached/responses change
  useEffect(() => {
    const list = buildChecklist(allTopics, allQuestions, attachedTopicIds, responses);
    setChecklist(list);
  }, [allTopics, allQuestions, attachedTopicIds, responses]);

  const handleToggleTopic = async (topicId: string, currentlyAttached: boolean) => {
    if (!task || !canEdit || topicSavingId) return;

    setTopicSavingId(topicId);
    setTopicError(null);

    try {
      if (currentlyAttached) {
        const { error } = await supabase
          .from('jobcard_task_hse_topics')
          .delete()
          .match({ task_id: task.id, topic_id: topicId });

        if (error) throw error;

        setAttachedTopicIds((prev) => prev.filter((id) => id !== topicId));
      } else {
        const { error } = await supabase
          .from('jobcard_task_hse_topics')
          .insert({ task_id: task.id, topic_id: topicId });

        // ignore unique-violation in case it was already attached somewhere
        if (error && error.code !== '23505') {
          throw error;
        }

        setAttachedTopicIds((prev) =>
          prev.includes(topicId) ? prev : [...prev, topicId]
        );
      }
    } catch (e: any) {
      setTopicError(e?.message || 'Error updating HSE topics for this jobcard.');
    } finally {
      setTopicSavingId(null);
    }
  };

  const handleSetDraft = (questionId: string, value: string) => {
    setAnswerDrafts((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleSaveResponses = async () => {
    if (!task || !canFill || savingAnswers) return;

    setSavingAnswers(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const trimmedName = responderName.trim() || null;
      const taskId = task.id;
      const rowsToInsert: {
        task_id: string;
        question_id: string;
        response_value: string;
        responder_name: string | null;
      }[] = [];

      // Build payload based on drafts vs existing responses
      for (const { questions } of checklist) {
        for (const q of questions) {
          const draftValueRaw = answerDrafts[q.id];
          if (draftValueRaw === undefined) continue; // nothing changed for this question

          const draftValue = draftValueRaw.trim();
          if (!draftValue) continue; // don't save blanks

          const existingValue = q.response?.response_value?.trim() || '';

          // If value hasn't actually changed, skip
          if (existingValue && existingValue === draftValue) continue;

          // We only support adding / first-time answering here; updates will be ignored on conflict.
          rowsToInsert.push({
            task_id: taskId,
            question_id: q.id,
            response_value: draftValue,
            responder_name: trimmedName,
          });
        }
      }

      if (!rowsToInsert.length) {
        setSaveSuccess('No new responses to save.');
        setSavingAnswers(false);
        return;
      }

      // Insert / upsert responses
      // ignoreDuplicates => ON CONFLICT DO NOTHING (no updates, only first-time answers)
      const { error } = await supabase
        .from('jobcard_task_hse_responses')
        .upsert(rowsToInsert, {
          onConflict: 'task_id,question_id',
          ignoreDuplicates: true,
        });

      if (error) {
        throw error;
      }

      // Reload responses from DB to refresh timestamps etc.
      const { data: freshResponses, error: reloadError } = await supabase
        .from('jobcard_task_hse_responses')
        .select('*')
        .eq('task_id', taskId);

      if (reloadError) {
        throw reloadError;
      }

      setResponses((freshResponses || []) as HseResponse[]);
      setSaveSuccess('HSE responses saved.');
      // Clear drafts now that they’re committed
      setAnswerDrafts({});
    } catch (e: any) {
      setSaveError(e?.message || 'Error saving HSE responses.');
    } finally {
      setSavingAnswers(false);
    }
  };

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="rounded-xl border bg-white shadow-sm p-4 text-sm text-slate-600">
          Loading jobcard…
        </div>
      </main>
    );
  }

  if (error || !task) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        <Link
          href="/dashboard"
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          ← Back to dashboard
        </Link>
        <div className="rounded-xl border bg-white shadow-sm p-4 text-sm text-slate-700">
          {error || 'Jobcard not found.'}
        </div>
      </main>
    );
  }

  const paddedItem = String(task.item_seq).padStart(2, '0');
  const baseCode = `${task.projectnumber}-${paddedItem}`;
  const pathMap = buildPathMap(nodes, baseCode);
  const wbsPath = pathMap[task.wbs_node_id] || baseCode;

  const statusLabel = (task.status || 'planned').toLowerCase();

  const qrValue =
    task.qr_slug &&
    ((typeof window !== 'undefined'
      ? `${window.location.origin}/jobcard/${task.qr_slug}`
      : `/jobcard/${task.qr_slug}`));

  // HSE summary counts
  const totalQuestions = checklist.reduce(
    (sum, item) => sum + item.questions.length,
    0
  );
  const answeredQuestions = checklist.reduce(
    (sum, item) =>
      sum +
      item.questions.filter(
        (q) =>
          q.response?.response_value &&
          q.response.response_value.trim() !== ''
      ).length,
    0
  );
  const allAnswered =
    totalQuestions > 0 && answeredQuestions === totalQuestions;

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex gap-2 items-center">
            <Link
              href="/dashboard"
              className="text-[11px] text-slate-500 hover:text-slate-900"
            >
              ← Back to dashboard
            </Link>
            <span className="inline-flex items-center rounded-full bg-slate-900 text-white px-2 py-0.5 text-[10px] uppercase tracking-wide">
              Jobcard
            </span>
          </div>

          <h1 className="mt-2 text-xl md:text-2xl font-semibold">
            {task.title}
          </h1>

          <div className="text-xs md:text-sm text-slate-600 space-y-0.5">
            <div>
              <span className="font-mono font-semibold">{wbsPath}</span>{' '}
              <span className="text-slate-400">·</span>{' '}
              <span>{item?.line_desc ?? 'Project item'}</span>
            </div>
            <div className="text-slate-500">
              Project{' '}
              <span className="font-mono">{task.projectnumber}</span> · Item{' '}
              <span className="font-mono">{paddedItem}</span>
            </div>
          </div>
        </div>

        <div className="text-right space-y-3">
          <div className="inline-flex flex-col items-end gap-1">
            <div className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]">
              <span
                className={`mr-1 inline-block h-2 w-2 rounded-full ${
                  statusLabel === 'complete'
                    ? 'bg-emerald-500'
                    : statusLabel === 'in_progress'
                    ? 'bg-amber-500'
                    : 'bg-slate-400'
                }`}
              />
              <span className="uppercase tracking-wide text-[10px] text-slate-600">
                {statusLabel.replace('_', ' ')}
              </span>
            </div>

            {totalQuestions > 0 && (
              <div
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] border ${
                  allAnswered
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                    : 'border-amber-500 bg-amber-50 text-amber-700'
                }`}
              >
                <span className="font-mono mr-1">
                  {answeredQuestions}/{totalQuestions}
                </span>
                <span>HSE questions answered</span>
              </div>
            )}
          </div>

          {qrValue && (
            <div className="inline-flex flex-col items-end gap-1">
              <div className="text-[11px] text-slate-500">
                Scan to open jobcard
              </div>
              <div className="rounded-lg border bg-white p-2 inline-block">
                <QRCode value={qrValue} size={96} />
              </div>
              <div className="text-[10px] text-slate-400">
                <span className="font-mono">{task.qr_slug}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[2fr,1.2fr]">
        {/* Main details */}
        <section className="rounded-2xl border bg-white shadow-sm p-4 md:p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">
            Work details
          </h2>

          {task.description && (
            <div>
              <div className="text-[11px] font-medium text-slate-500 mb-1 uppercase tracking-wide">
                Scope
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {task.description}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 mt-2">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Planning
            </div>
            <p className="text-[12px] text-slate-600">
              We can later surface fields like location, planned dates and supervisor
              here once they’re finalised in the schema.
            </p>
          </div>
        </section>

        {/* HSE panel only */}
        <aside>
          <section className="rounded-2xl border bg-slate-50 px-4 py-3 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                HSE briefing
              </h3>
              <span className="text-[10px] text-slate-500">
                Read and record before starting work
              </span>
            </div>

            {/* Manager-only topic selector */}
            {canEdit && (
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-slate-600">
                  Topics attached to this job
                </div>
                {allTopics.length === 0 ? (
                  <div className="text-[11px] text-slate-500">
                    No HSE topics are defined in the system yet.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {allTopics.map((topic) => {
                      const attached = attachedTopicIds.includes(topic.id);
                      const busy = topicSavingId === topic.id;
                      return (
                        <button
                          key={topic.id}
                          type="button"
                          disabled={busy}
                          onClick={() => handleToggleTopic(topic.id, attached)}
                          className={`text-[11px] px-2 py-0.5 rounded-full border ${
                            attached
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          } disabled:opacity-60`}
                        >
                          {topic.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                {topicError && (
                  <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                    {topicError}
                  </div>
                )}
              </div>
            )}

            {/* Checklist */}
            {checklist.length === 0 ? (
              <p className="text-[12px] text-slate-600">
                {allTopics.length === 0
                  ? 'No HSE topics are available.'
                  : 'No HSE topics are attached to this jobcard yet. A project manager can attach topics above.'}
              </p>
            ) : (
              <div className="space-y-3 max-h-[340px] overflow-auto pr-1">
                {checklist.map(({ topic, questions }) => (
                  <div
                    key={topic.id}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-slate-800">
                        {topic.name}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {topic.code}
                      </div>
                    </div>

                    {topic.description && (
                      <p className="text-[11px] text-slate-600">
                        {topic.description}
                      </p>
                    )}

                    {questions.length > 0 ? (
                      <ul className="mt-1 space-y-1">
                        {questions.map((q) => {
                          const r = q.response;
                          const existingValue = r?.response_value?.trim() || '';
                          const draftValueRaw = answerDrafts[q.id];
                          const currentValue =
                            draftValueRaw !== undefined
                              ? draftValueRaw
                              : existingValue;

                          const answered = !!existingValue;

                          const isYes = currentValue.toLowerCase() === 'yes';
                          const isNo = currentValue.toLowerCase() === 'no';

                          const disabled = !canFill || answered; // once answered, treat as read-only

                          return (
                            <li
                              key={q.id}
                              className="flex flex-col gap-1 text-[11px] rounded-lg bg-slate-50 px-2 py-1"
                            >
                              <div className="flex items-start gap-2">
                                <span className="mt-[4px] inline-block h-2 w-2 rounded-full bg-slate-400" />
                                <span>{q.question_text}</span>
                              </div>

                              {/* Controls */}
                              {canFill && !answered && (
                                <div className="flex items-center justify-between gap-2 pl-4">
                                  {q.response_type === 'yes_no' ? (
                                    <div className="inline-flex gap-1">
                                      <button
                                        type="button"
                                        disabled={disabled}
                                        onClick={() =>
                                          handleSetDraft(q.id, 'Yes')
                                        }
                                        className={`px-2 py-[2px] rounded-full border text-[10px] ${
                                          isYes
                                            ? 'bg-emerald-600 text-white border-emerald-600'
                                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                        } disabled:opacity-60`}
                                      >
                                        Yes
                                      </button>
                                      <button
                                        type="button"
                                        disabled={disabled}
                                        onClick={() =>
                                          handleSetDraft(q.id, 'No')
                                        }
                                        className={`px-2 py-[2px] rounded-full border text-[10px] ${
                                          isNo
                                            ? 'bg-red-600 text-white border-red-600'
                                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                        } disabled:opacity-60`}
                                      >
                                        No
                                      </button>
                                    </div>
                                  ) : (
                                    <input
                                      type="text"
                                      disabled={disabled}
                                      value={currentValue}
                                      onChange={(e) =>
                                        handleSetDraft(q.id, e.target.value)
                                      }
                                      className="flex-1 rounded-md border px-2 py-[2px] text-[11px]"
                                      placeholder="Enter response"
                                    />
                                  )}
                                </div>
                              )}

                              {/* Existing recorded response */}
                              {answered && (
                                <div className="flex items-center justify-between gap-2 pl-4">
                                  <span className="inline-flex items-center rounded-full border px-2 py-[1px] text-[10px] bg-white">
                                    Response:{' '}
                                    <span className="ml-1 font-semibold">
                                      {existingValue}
                                    </span>
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    {r?.responder_name && (
                                      <>
                                        by{' '}
                                        <span className="font-medium">
                                          {r.responder_name}
                                        </span>{' '}
                                      </>
                                    )}
                                    {r?.responded_at && (
                                      <>
                                        at{' '}
                                        <span className="font-mono">
                                          {new Date(
                                            r.responded_at
                                          ).toLocaleString()}
                                        </span>
                                      </>
                                    )}
                                  </span>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-slate-500">
                        No questions configured for this topic yet.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Save bar for HSE responses */}
            {canFill && checklist.length > 0 && (
              <div className="mt-3 pt-2 border-t border-slate-200 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 space-y-1">
                    <label className="block text-[11px] font-medium text-slate-600">
                      Responder name
                      <input
                        type="text"
                        className="mt-1 block w-full rounded-md border px-2 py-1 text-[11px]"
                        placeholder="Name to record against responses"
                        value={responderName}
                        onChange={(e) => setResponderName(e.target.value)}
                      />
                    </label>
                    <p className="text-[10px] text-slate-500">
                      Responses are stored per jobcard and can’t be changed later
                      (only added).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveResponses}
                    disabled={savingAnswers}
                    className="ml-2 h-8 px-3 rounded-full border border-slate-900 text-[11px] font-medium text-slate-900 hover:bg-slate-900 hover:text-white disabled:opacity-60"
                  >
                    {savingAnswers ? 'Saving…' : 'Save HSE responses'}
                  </button>
                </div>

                {saveError && (
                  <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                    {saveError}
                  </div>
                )}
                {saveSuccess && (
                  <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                    {saveSuccess}
                  </div>
                )}
              </div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

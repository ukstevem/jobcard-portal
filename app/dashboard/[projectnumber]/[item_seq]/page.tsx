import { notFound } from 'next/navigation';
import { use } from 'react';
import ProjectItemClient from './ProjectItemClient';

type RouteParams = { projectnumber: string; item_seq: string };

export default function Page({ params }: { params: Promise<RouteParams> }) {
  const { projectnumber, item_seq } = use(params);

  const itemSeqNumber = Number.parseInt(item_seq, 10);
  if (!Number.isFinite(itemSeqNumber)) notFound();

  return <ProjectItemClient projectnumber={projectnumber} itemSeq={itemSeqNumber} />;
}

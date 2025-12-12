import { use } from 'react';
import ProjectItemClient from './ProjectItemClient';

type RouteParams = {
  projectnumber: string;
  item_seq: string;
};

export default function Page({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  // In Next 16, params is a Promise in server components
  const { projectnumber, item_seq } = use(params);

  const itemSeqNumber = Number(item_seq);

  return (
    <ProjectItemClient
      projectnumber={projectnumber}
      itemSeq={itemSeqNumber}
    />
  );
}

import { use } from 'react';
import JobcardClient from './JobcardClient';

type RouteParams = {
  qr_slug: string;
};

export default function Page({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { qr_slug } = use(params);

  return <JobcardClient qrSlug={qr_slug} />;
}

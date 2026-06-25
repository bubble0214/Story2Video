'use client';

import { useSearchParams } from 'next/navigation';
import { WorkflowPage } from '@/features/workflow/workflow-page';

export default function VideoPage() {
  const searchParams = useSearchParams();
  const draft = searchParams.get('draft');

  return (
    <WorkflowPage
      workflowType="generate_video"
      title="视频生成"
      description="从内容生成数字人视频"
      initialDraftId={draft ?? undefined}
    />
  );
}

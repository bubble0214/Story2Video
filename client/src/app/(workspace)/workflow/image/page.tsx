'use client';

import { useSearchParams } from 'next/navigation';
import { WorkflowPage } from '@/features/workflow/workflow-page';

export default function ImagePage() {
  const searchParams = useSearchParams();
  const draft = searchParams.get('draft');

  return (
    <WorkflowPage
      workflowType="generate_image"
      title="图片生成"
      description="根据内容生成图片"
      initialDraftId={draft ?? undefined}
    />
  );
}

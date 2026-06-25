'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { WorkflowPage } from '@/features/workflow/workflow-page';

function ImagePageInner() {
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

export default function ImagePage() {
  return (
    <Suspense fallback={<div className="py-8 px-4 max-w-2xl mx-auto"><p className="text-muted-foreground">加载中...</p></div>}>
      <ImagePageInner />
    </Suspense>
  );
}

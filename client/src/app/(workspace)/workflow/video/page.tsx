'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { WorkflowPage } from '@/features/workflow/workflow-page';

function VideoPageInner() {
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

export default function VideoPage() {
  return (
    <Suspense fallback={<div className="py-8 px-4 max-w-2xl mx-auto"><p className="text-muted-foreground">加载中...</p></div>}>
      <VideoPageInner />
    </Suspense>
  );
}

'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { WorkflowPage } from '@/features/workflow/workflow-page';

function LyricsPageInner() {
  const searchParams = useSearchParams();
  const draft = searchParams.get('draft');

  return (
    <WorkflowPage
      workflowType="generate_lyrics"
      title="歌词生成"
      description="根据剧本内容生成歌词"
      initialDraftId={draft ?? undefined}
    />
  );
}

export default function LyricsPage() {
  return (
    <Suspense fallback={<div className="py-8 px-4 max-w-2xl mx-auto"><p className="text-muted-foreground">加载中...</p></div>}>
      <LyricsPageInner />
    </Suspense>
  );
}

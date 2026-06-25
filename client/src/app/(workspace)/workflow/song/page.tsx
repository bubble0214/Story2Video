'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { WorkflowPage } from '@/features/workflow/workflow-page';

function SongPageInner() {
  const searchParams = useSearchParams();
  const draft = searchParams.get('draft');

  return (
    <WorkflowPage
      workflowType="generate_song"
      title="歌曲生成"
      description="从歌词生成音乐"
      initialDraftId={draft ?? undefined}
    />
  );
}

export default function SongPage() {
  return (
    <Suspense fallback={<div className="py-8 px-4 max-w-2xl mx-auto"><p className="text-muted-foreground">加载中...</p></div>}>
      <SongPageInner />
    </Suspense>
  );
}

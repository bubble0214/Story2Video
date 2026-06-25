'use client';

import { useSearchParams } from 'next/navigation';
import { WorkflowPage } from '@/features/workflow/workflow-page';

export default function SongPage() {
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

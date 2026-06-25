'use client';

import { useSearchParams } from 'next/navigation';
import { WorkflowPage } from '@/features/workflow/workflow-page';

export default function LyricsPage() {
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

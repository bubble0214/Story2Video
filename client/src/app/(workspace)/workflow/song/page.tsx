'use client';

import { WorkflowPage } from '@/features/workflow/workflow-page';

export default function SongPage() {
  return (
    <WorkflowPage
      workflowType="generate_song"
      title="Song Generation"
      description="Generate music from your lyrics"
    />
  );
}

'use client';

import { WorkflowPage } from '@/features/workflow/workflow-page';

export default function LyricsPage() {
  return (
    <WorkflowPage
      workflowType="generate_lyrics"
      title="Lyrics Generation"
      description="Generate song lyrics from your script content"
    />
  );
}

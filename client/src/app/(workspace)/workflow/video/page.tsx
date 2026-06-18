'use client';

import { WorkflowPage } from '@/features/workflow/workflow-page';

export default function VideoPage() {
  return (
    <WorkflowPage
      workflowType="generate_video"
      title="Video Generation"
      description="Generate an avatar video from your content"
    />
  );
}

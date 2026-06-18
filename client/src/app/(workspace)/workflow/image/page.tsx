'use client';

import { WorkflowPage } from '@/features/workflow/workflow-page';

export default function ImagePage() {
  return (
    <WorkflowPage
      workflowType="generate_image"
      title="Image Generation"
      description="Generate an image from your content"
    />
  );
}

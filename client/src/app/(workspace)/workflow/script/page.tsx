'use client';

import { WorkflowPage } from '@/features/workflow/workflow-page';

export default function ScriptPage() {
  return (
    <WorkflowPage
      workflowType="generate_script"
      title="Script Generation"
      description="Generate a screenplay from your novel content"
    />
  );
}

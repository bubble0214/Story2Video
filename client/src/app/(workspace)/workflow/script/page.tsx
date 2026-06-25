'use client';

import { WorkflowPage } from '@/features/workflow/workflow-page';

export default function ScriptPage() {
  return (
    <WorkflowPage
      workflowType="generate_script"
      title="剧本生成"
      description="根据小说内容生成剧本"
    />
  );
}

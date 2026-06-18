'use client';

import { useWorkflow } from '@/hooks/use-workflow';
import { Button } from '@/components/ui/button';

interface NovelTabProps {
  content: string;
  workflowType?: string;
}

export function NovelTab({ content, workflowType }: NovelTabProps) {
  const hasContent = content && content !== 'No novel content generated.';
  const { goToNextStep } = useWorkflow();

  return (
    <div className="space-y-4">
      {hasContent ? (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          {content}
        </div>
      )}
      {workflowType && (
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={() => goToNextStep(workflowType)}>
            Next Step: Generate Script
          </Button>
        </div>
      )}
    </div>
  );
}

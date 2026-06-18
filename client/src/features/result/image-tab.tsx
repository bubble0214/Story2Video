'use client';

import { useWorkflow } from '@/hooks/use-workflow';
import { Button } from '@/components/ui/button';

interface ImageTabProps {
  imageUrl?: string | null;
  workflowType?: string;
}

export function ImageTab({ imageUrl, workflowType }: ImageTabProps) {
  const { goToNextStep } = useWorkflow();

  return (
    <div className="space-y-4">
      {imageUrl ? (
        <div className="rounded-lg overflow-hidden border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Generated image"
            className="w-full h-auto"
          />
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          Image generation not yet available. Continue the workflow to generate
          one.
        </div>
      )}
      {workflowType && (
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={() => goToNextStep(workflowType)}>
            Next Step: Generate Video
          </Button>
        </div>
      )}
    </div>
  );
}
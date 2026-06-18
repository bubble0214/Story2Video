'use client';

import { useState } from 'react';
import { useWorkflow } from '@/hooks/use-workflow';
import { Button } from '@/components/ui/button';

interface NovelTabProps {
  content: string;
  workflowType?: string;
  chapters?: { title: string; content: string }[];
}

export function NovelTab({ content, workflowType, chapters }: NovelTabProps) {
  const [currentChapter, setCurrentChapter] = useState(0);
  const hasContent = content && content !== 'No novel content generated.';
  const hasChapters = chapters && chapters.length > 0;
  const { goToNextStep } = useWorkflow();

  if (!hasContent && !hasChapters) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {content}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hasChapters ? (
        <>
          {/* Chapter navigation */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b">
            {chapters!.map((ch, i) => (
              <Button
                key={i}
                variant={i === currentChapter ? 'default' : 'outline'}
                size="sm"
                className="shrink-0"
                onClick={() => setCurrentChapter(i)}
              >
                {ch.title.length > 20 ? ch.title.slice(0, 20) + '…' : ch.title}
              </Button>
            ))}
          </div>

          {/* Current chapter content */}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <h2 className="text-xl font-bold">{chapters![currentChapter].title}</h2>
            <p className="whitespace-pre-wrap leading-relaxed mt-4">
              {chapters![currentChapter].content}
            </p>
          </div>

          {/* Chapter navigation footer */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              disabled={currentChapter === 0}
              onClick={() => setCurrentChapter(currentChapter - 1)}
            >
              Previous Chapter
            </Button>
            <span className="text-sm text-muted-foreground">
              Chapter {currentChapter + 1} of {chapters!.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentChapter === chapters!.length - 1}
              onClick={() => setCurrentChapter(currentChapter + 1)}
            >
              Next Chapter
            </Button>
          </div>
        </>
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
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

'use client';

interface LyricsTabProps {
  content: string;
}

export function LyricsTab({ content }: LyricsTabProps) {
  const hasContent =
    content && content !== 'No lyrics content generated.';

  return (
    <div className="space-y-4">
      {hasContent ? (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="whitespace-pre-wrap italic leading-relaxed">
            {content}
          </p>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          {content}
        </div>
      )}
    </div>
  );
}

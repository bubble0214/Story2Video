'use client';

interface ScriptTabProps {
  content: string;
}

export function ScriptTab({ content }: ScriptTabProps) {
  const hasContent = content && content !== 'No script content generated.';

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
    </div>
  );
}

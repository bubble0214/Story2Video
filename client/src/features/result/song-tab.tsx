'use client';

interface SongTabProps {
  audioUrl?: string | null;
}

export function SongTab({ audioUrl }: SongTabProps) {
  if (!audioUrl) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          Song generation not yet available.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-8 space-y-4">
      <p className="text-lg font-semibold">Generated Song</p>
      <audio controls className="w-full max-w-md mx-auto">
        <source src={audioUrl} type="audio/mpeg" />
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}

'use client';

interface VideoTabProps {
  videoUrl?: string | null;
}

export function VideoTab({ videoUrl }: VideoTabProps) {
  if (!videoUrl) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          Video generation not yet available.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-8 space-y-4">
      <p className="text-lg font-semibold">Generated Video</p>
      <video controls className="w-full max-w-2xl mx-auto rounded-lg">
        <source src={videoUrl} type="video/mp4" />
        Your browser does not support the video element.
      </video>
    </div>
  );
}

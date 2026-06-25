'use client';

interface VideoTabProps {
  videoUrl?: string | null;
}

export function VideoTab({ videoUrl }: VideoTabProps) {
  if (!videoUrl) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          视频生成暂不可用。
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-8 space-y-4">
      <p className="text-lg font-semibold">生成的视频</p>
      <video controls className="w-full max-w-2xl mx-auto rounded-lg">
        <source src={videoUrl} type="video/mp4" />
        您的浏览器不支持视频播放。
      </video>
    </div>
  );
}

'use client';

interface SongTabProps {
  audioUrl?: string | null;
}

export function SongTab({ audioUrl }: SongTabProps) {
  if (!audioUrl) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          歌曲生成暂不可用。
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-8 space-y-4">
      <p className="text-lg font-semibold">生成的歌曲</p>
      <audio controls className="w-full max-w-md mx-auto">
        <source src={audioUrl} type="audio/mpeg" />
        您的浏览器不支持音频播放。
      </audio>
    </div>
  );
}

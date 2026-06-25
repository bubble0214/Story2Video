'use client';

interface ImageTabProps {
  imageUrl?: string | null;
}

export function ImageTab({ imageUrl }: ImageTabProps) {

  return (
    <div className="space-y-4">
      {imageUrl ? (
        <div className="rounded-lg overflow-hidden border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="生成的图片"
            className="w-full h-auto"
          />
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          图片生成暂不可用。继续工作流以生成。
        </div>
      )}
    </div>
  );
}

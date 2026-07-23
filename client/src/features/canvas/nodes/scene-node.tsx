import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import type { SceneData } from '@/types/canvas';
import { Mountain, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useCanvasGenerate } from '@/hooks/use-canvas-generate';

type SceneNode = Node<SceneData>;

export function SceneNode({ data, selected, id }: NodeProps<SceneNode>) {
  if (!data) return null;
  const imageUrl = data.image || data.imageUrl;
  const [imgError, setImgError] = useState(false);
  const { generate, isGenerating } = useCanvasGenerate();

  const handleRegenerate = (e: React.MouseEvent) => {
    e.stopPropagation();
    generate({
      nodeId: id,
      nodeType: 'scene',
      prompt: data.prompt ?? data.sceneName ?? '',
      stylePrompt: data.stylePrompt,
      model: data.model,
      resolution: data.resolution,
      aspectRatio: data.aspectRatio ?? '21:9',
      referenceImages: data.referenceImages,
    });
  };

  const showImage = !!imageUrl && !imgError;
  const showPlaceholder = !imageUrl || imgError;

  return (
    <div
      className={`min-w-[220px] max-w-[280px] rounded-lg border bg-card shadow-sm ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      {/* Top handle */}
      <Handle type="target" position={Position.Top} className="!bg-border" />

      {/* Image */}
      <div className="bg-muted flex items-center justify-center relative min-h-[120px] aspect-video group">
        {showImage && (
          <>
            <img
              src={imageUrl}
              alt={data.sceneName ?? data.label}
              className="w-full h-full object-cover rounded-t-lg"
              onError={() => setImgError(true)}
            />
            {/* Regenerate overlay button */}
            <button
              onClick={handleRegenerate}
              disabled={isGenerating}
              className="absolute top-2 right-2 bg-background/80 hover:bg-background rounded-full w-7 h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              title="重新生成图片"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
            </button>
          </>
        )}
        {showPlaceholder && (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Mountain className="h-8 w-8 opacity-30" />
            <span className="text-xs">{imgError ? '图片加载失败' : '待生成'}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-3 py-2 border-t">
        <div className="flex items-center justify-between gap-1">
          <p className="text-sm font-semibold truncate">
            {data.sceneName ?? data.label}
          </p>
          {data.appearanceCount && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              出现{data.appearanceCount}次
            </span>
          )}
        </div>
        {data.baseScene && (
          <p className="text-[10px] text-primary/70 truncate">
            基于: {data.baseScene}
          </p>
        )}
        {data.description && (
          <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1">
            {data.description}
          </p>
        )}
      </div>

      {/* Bottom handle */}
      <Handle type="source" position={Position.Bottom} className="!bg-border" />
    </div>
  );
}
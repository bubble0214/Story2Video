import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import type { SceneData } from '@/types/canvas';
import { Mountain, Loader2 } from 'lucide-react';

type SceneNode = Node<SceneData>;

export function SceneNode({ data, selected }: NodeProps<SceneNode>) {
  if (!data) return null;
  const imageUrl = data.image || data.imageUrl;

  return (
    <div
      className={`min-w-[220px] max-w-[280px] rounded-lg border bg-card shadow-sm ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      {/* Top handle */}
      <Handle type="target" position={Position.Top} className="!bg-border" />

      {/* Image */}
      <div className="aspect-video bg-muted flex items-center justify-center relative">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={data.sceneName ?? data.label}
            className="w-full h-full object-contain rounded-t-lg"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Mountain className="h-8 w-8 opacity-30" />
            <span className="text-xs">待生成</span>
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
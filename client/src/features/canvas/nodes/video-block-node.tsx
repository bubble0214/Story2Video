import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import type { VideoBlockData } from '@/types/canvas';
import { Play, Loader2 } from 'lucide-react';

type VideoBlockNode = Node<VideoBlockData>;

export function VideoBlockNode({ data, selected }: NodeProps<VideoBlockNode>) {
  if (!data) return null;
  return (
    <div
      className={`min-w-[180px] max-w-[240px] rounded-lg border bg-card shadow-sm ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-border" />
      <div className="px-3 py-2 border-b bg-muted/50">
        <p className="text-xs font-semibold truncate">{data.label}</p>
      </div>
      <div className="p-2">
        {data.videoUrl ? (
          <div className="relative">
            <video
              src={data.videoUrl}
              controls
              className="w-full h-auto rounded max-h-[200px]"
            />
            {data.duration && (
              <span className="text-[10px] text-muted-foreground absolute bottom-1 right-1 bg-background/80 px-1 rounded">
                {data.duration}s
              </span>
            )}
          </div>
        ) : (
          <div className="h-24 flex flex-col items-center justify-center bg-muted rounded gap-1">
            <Play className="h-6 w-6 text-muted-foreground/40" />
            <span className="text-[10px] text-muted-foreground">No video</span>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-border" />
    </div>
  );
}
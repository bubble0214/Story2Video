import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import type { AudioBlockData } from '@/types/canvas';
import { Volume2, Loader2 } from 'lucide-react';

type AudioBlockNode = Node<AudioBlockData>;

export function AudioBlockNode({ data, selected }: NodeProps<AudioBlockNode>) {
  if (!data) return null;
  return (
    <div
      className={`min-w-[160px] max-w-[220px] rounded-lg border bg-card shadow-sm ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-border" />
      <div className="px-3 py-2 border-b bg-muted/50">
        <p className="text-xs font-semibold truncate">{data.label}</p>
      </div>
      <div className="p-2">
        {data.audioUrl ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground truncate flex-1">
                Audio
              </span>
              {data.duration && (
                <span className="text-[10px] text-muted-foreground">
                  {data.duration}s
                </span>
              )}
            </div>
            <audio src={data.audioUrl} controls className="w-full h-6" />
          </div>
        ) : (
          <div className="h-16 flex flex-col items-center justify-center bg-muted rounded gap-1">
            <Volume2 className="h-5 w-5 text-muted-foreground/40" />
            <span className="text-[10px] text-muted-foreground">No audio</span>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-border" />
    </div>
  );
}
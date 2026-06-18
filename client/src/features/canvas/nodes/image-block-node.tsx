import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Node } from '@xyflow/react';

type ImageBlockNode = Node<{ label: string; imageUrl: string; altText?: string; linkedNovelTitle?: string }>;

export function ImageBlockNode({ data, selected }: NodeProps<ImageBlockNode>) {
  return (
    <div
      className={`min-w-[180px] max-w-[280px] rounded-lg border bg-card shadow-sm ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-border" />
      <div className="px-3 py-2 border-b bg-muted/50">
        <p className="text-xs font-semibold truncate">{data.label as string}</p>
      </div>
      <div className="p-2">
        {data.imageUrl ? (
          <img
            src={data.imageUrl as string}
            alt={data.altText ?? ''}
            className="w-full h-auto rounded object-cover max-h-[180px]"
          />
        ) : (
          <div className="h-24 flex items-center justify-center bg-muted rounded">
            <span className="text-[10px] text-muted-foreground">No image</span>
          </div>
        )}
      </div>
      {data.linkedNovelTitle && (
        <div className="px-3 pb-2">
          <span className="text-[10px] text-primary/70">🔗 {data.linkedNovelTitle}</span>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-border" />
    </div>
  );
}

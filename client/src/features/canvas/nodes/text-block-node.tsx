import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Node } from '@xyflow/react';

type TextBlockNode = Node<{ label: string; content: string; linkedNovelTitle?: string }>;

export function TextBlockNode({ data, selected }: NodeProps<TextBlockNode>) {
  return (
    <div
      className={`min-w-[200px] max-w-[300px] rounded-lg border bg-card shadow-sm ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-border" />
      <div className="px-3 py-2 border-b bg-muted/50">
        <p className="text-xs font-semibold truncate">{data.label as string}</p>
      </div>
      <div className="px-3 py-2 max-h-[200px] overflow-y-auto">
        <p className="text-xs text-muted-foreground whitespace-pre-wrap">
          {(data.content as string) || 'Empty text block'}
        </p>
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

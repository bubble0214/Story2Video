import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Node } from '@xyflow/react';

type NoteCardNode = Node<{ label: string; content: string; color: string }>;

export function NoteCardNode({ data, selected }: NodeProps<NoteCardNode>) {
  return (
    <div
      className={`min-w-[160px] max-w-[240px] rounded-lg border shadow-sm ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
      style={{ backgroundColor: (data.color as string) || '#fef9c3' }}
    >
      <Handle type="target" position={Position.Top} className="!bg-border" />
      <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
        <p className="text-xs font-semibold truncate">{data.label as string}</p>
      </div>
      <div className="px-3 py-2 max-h-[160px] overflow-y-auto">
        <p className="text-xs whitespace-pre-wrap">{(data.content as string) || 'Empty note'}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-border" />
    </div>
  );
}

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Node } from '@xyflow/react';
import type { CharacterData } from '@/types/canvas';
import { User, Loader2 } from 'lucide-react';

type CharacterNode = Node<CharacterData>;

export function CharacterNode({ data, selected }: NodeProps<CharacterNode>) {
  if (!data) return null;
  const imageUrl = data.image || data.imageUrl;

  return (
    <div
      className={`min-w-[200px] max-w-[260px] rounded-lg border bg-card shadow-sm ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      {/* Top handle */}
      <Handle type="target" position={Position.Top} className="!bg-border" />

      {/* Image */}
      <div className="bg-muted flex items-center justify-center relative min-h-[200px]">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={data.characterName ?? data.label}
            className="w-full h-auto object-contain rounded-t-lg"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <User className="h-8 w-8 opacity-30" />
            <span className="text-xs">待生成</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-3 py-2 border-t">
        <div className="flex items-center justify-between gap-1">
          <p className="text-sm font-semibold truncate">
            {data.characterName ?? data.label}
          </p>
          {data.appearanceCount && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              第{data.appearanceCount}集
            </span>
          )}
        </div>
        {data.baseCharacter && (
          <p className="text-[10px] text-primary/70 truncate">
            基于: {data.baseCharacter}
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
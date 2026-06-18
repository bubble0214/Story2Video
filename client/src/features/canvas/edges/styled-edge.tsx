import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
  type Edge,
} from '@xyflow/react';

type StyledEdge = Edge<{ label?: string }>;

export function StyledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<StyledEdge>) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? 'var(--primary)' : '#888',
          strokeWidth: selected ? 2 : 1.5,
        }}
      />
      {data?.label && (
        <foreignObject
          width={120}
          height={20}
          x={(sourceX + targetX) / 2 - 60}
          y={(sourceY + targetY) / 2 - 10}
          className="overflow-visible"
        >
          <div
            className="text-[10px] text-muted-foreground bg-background/80 px-1.5 py-0.5 rounded text-center whitespace-nowrap"
            style={{ lineHeight: '16px' }}
          >
            {data.label}
          </div>
        </foreignObject>
      )}
    </>
  );
}

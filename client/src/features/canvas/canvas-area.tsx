'use client';

import { useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ConnectionMode,
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCanvasStore } from '@/stores/canvas-store';
import { TextBlockNode } from './nodes/text-block-node';
import { ImageBlockNode } from './nodes/image-block-node';
import { NoteCardNode } from './nodes/note-card-node';
import { StyledEdge } from './edges/styled-edge';

const nodeTypes = {
  textBlock: TextBlockNode,
  imageBlock: ImageBlockNode,
  noteCard: NoteCardNode,
};

const edgeTypes = {
  styled: StyledEdge,
};

export function CanvasArea() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    connectMode,
    setSelectedNodeId,
  } = useCanvasStore();

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  const hasNodes = nodes.length > 0;

  return (
    <div className="flex-1 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodeTypes={nodeTypes as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        edgeTypes={edgeTypes as any}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        connectionMode={connectMode ? ConnectionMode.Loose : ConnectionMode.Strict}
        selectionMode={SelectionMode.Partial}
        fitView
        deleteKeyCode="Delete"
        multiSelectionKeyCode="Shift"
        className="bg-background"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="hsl(var(--border))"
        />
        <Controls
          showInteractive={false}
          className="[&>button]:bg-background [&>button]:border-border"
        />
        <MiniMap
          nodeStrokeColor="hsl(var(--border))"
          nodeColor="hsl(var(--muted))"
          maskColor="hsl(var(--muted)/0.3)"
          className="!border !border-border rounded-md"
        />

        {/* Empty state */}
        {!hasNodes && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center max-w-xs">
              <p className="text-muted-foreground text-sm font-medium">
                Start building your story
              </p>
              <p className="text-muted-foreground/60 text-xs mt-1">
                Use the toolbar above to add text blocks, notes, and images.
                Connect them to map out your story structure.
              </p>
            </div>
          </div>
        )}
      </ReactFlow>
    </div>
  );
}

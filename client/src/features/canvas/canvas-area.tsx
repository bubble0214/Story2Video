'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ConnectionMode,
  SelectionMode,
  useReactFlow,
  type OnSelectionChangeParams,
  type OnMove,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCanvasStore } from '@/stores/canvas-store';
import type { CanvasNodeType } from '@/types/canvas';
import { TextBlockNode } from './nodes/text-block-node';
import { ImageBlockNode } from './nodes/image-block-node';
import { NoteCardNode } from './nodes/note-card-node';
import { CharacterNode } from './nodes/character-node';
import { SceneNode } from './nodes/scene-node';
import { VideoBlockNode } from './nodes/video-block-node';
import { AudioBlockNode } from './nodes/audio-block-node';
import { StyledEdge } from './edges/styled-edge';
import { CanvasNodeToolbar } from './canvas-node-toolbar';
import { CanvasBottomControl } from './canvas-bottom-control';

const nodeTypes = {
  textBlock: TextBlockNode,
  imageBlock: ImageBlockNode,
  noteCard: NoteCardNode,
  character: CharacterNode,
  scene: SceneNode,
  videoBlock: VideoBlockNode,
  audioBlock: AudioBlockNode,
};

const edgeTypes = {
  styled: StyledEdge,
};

/* ─── Keyboard shortcuts ─── */
function CanvasKeyboardShortcuts() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const {
    nodes,
    addNode,
    setSelectedNodeIds,
  } = useCanvasStore();
  const historyRef = useRef<{ nodes: typeof nodes }[]>([]);
  const historyIdxRef = useRef(-1);

  // Save snapshot on node change
  useEffect(() => {
    if (nodes.length === 0) return;
    const idx = historyIdxRef.current;
    const hist = historyRef.current;
    // remove future entries if we're not at the end
    if (idx < hist.length - 1) {
      hist.splice(idx + 1);
    }
    hist.push({ nodes: JSON.parse(JSON.stringify(nodes)) });
    if (hist.length > 50) hist.shift(); // cap at 50
    historyIdxRef.current = hist.length - 1;
  }, [nodes]);

  const undo = useCallback(() => {
    const idx = historyIdxRef.current;
    const hist = historyRef.current;
    if (idx <= 0) return;
    historyIdxRef.current = idx - 1;
    const snapshot = hist[idx - 1];
    useCanvasStore.setState({ nodes: snapshot.nodes, isDirty: true });
  }, []);

  const redo = useCallback(() => {
    const idx = historyIdxRef.current;
    const hist = historyRef.current;
    if (idx >= hist.length - 1) return;
    historyIdxRef.current = idx + 1;
    const snapshot = hist[idx + 1];
    useCanvasStore.setState({ nodes: snapshot.nodes, isDirty: true });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+Z Undo
      if (ctrl && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      // Ctrl+Shift+Z Redo
      if (ctrl && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
        return;
      }
      // Ctrl+A Select all
      if (ctrl && e.key === 'a') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        const allIds = nodes.map((n) => n.id);
        setSelectedNodeIds(allIds);
        return;
      }
      // Ctrl++ Zoom in
      if (ctrl && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomIn();
        return;
      }
      // Ctrl+- Zoom out
      if (ctrl && e.key === '-') {
        e.preventDefault();
        zoomOut();
        return;
      }
      // Ctrl+0 Reset zoom
      if (ctrl && e.key === '0') {
        e.preventDefault();
        fitView();
        return;
      }
      // Ctrl+Enter Generate
      if (ctrl && e.key === 'Enter') {
        e.preventDefault();
        const { batchGenerate, selectedNodeIds } = useCanvasStore.getState();
        batchGenerate();
        return;
      }
      // Tab new node (cycle through types)
      if (e.key === 'Tab' && !ctrl) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        const types: CanvasNodeType[] = ['character', 'scene', 'textBlock', 'imageBlock', 'videoBlock', 'audioBlock'];
        const idx = nodes.length % types.length;
        addNode(types[idx]);
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [nodes, undo, redo, zoomIn, zoomOut, fitView, addNode, setSelectedNodeIds]);

  return null; // invisible component
}

export function CanvasArea() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    connectMode,
    setSelectedNodeId,
    setSelectedNodeIds,
    gridSnap,
    viewport,
    setViewport,
    toggleGridSnap,
  } = useCanvasStore();

  const onMove: OnMove = useCallback(
    (_: unknown, viewport) => {
      setViewport({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
    },
    [setViewport],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
      const ids = selectedNodes.map((n) => n.id);
      setSelectedNodeIds(ids);
      setSelectedNodeId(ids[0] ?? null);
    },
    [setSelectedNodeIds, setSelectedNodeId],
  );

  const hasNodes = nodes.length > 0;

  return (
    <div className="flex-1 relative">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          nodeTypes={nodeTypes as any}
          // eslint-disable-next-line @typescript-eslint/no-explicitany
          edgeTypes={edgeTypes as any}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onSelectionChange={onSelectionChange}
          onMove={onMove}
          onMoveEnd={onMove}
          connectionMode={connectMode ? ConnectionMode.Loose : ConnectionMode.Strict}
          selectionMode={SelectionMode.Partial}
          fitView
          deleteKeyCode="Delete"
          multiSelectionKeyCode="Shift"
          snapToGrid={gridSnap}
          snapGrid={[15, 15]}
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
                  开始构建你的故事
                </p>
                <p className="text-muted-foreground/60 text-xs mt-1">
                  使用左侧面板添加角色、场景、文本、图片等节点。连接它们来构建故事结构。
                </p>
              </div>
            </div>
          )}
        </ReactFlow>

        {/* Node toolbar */}
        <CanvasNodeToolbar />

        {/* Bottom controls */}
        <CanvasBottomControl />

        {/* Keyboard shortcuts (needs ReactFlowProvider context) */}
        <CanvasKeyboardShortcuts />
      </ReactFlowProvider>
    </div>
  );
}
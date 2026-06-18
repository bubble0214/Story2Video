import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
} from '@xyflow/react';
import type { CanvasNodeData, CanvasEdgeData, CanvasData } from '@/types/canvas';

interface CanvasStore {
  // Current canvas metadata
  canvasId: string | null;
  canvasTitle: string;
  isDirty: boolean;

  // React Flow state
  nodes: Node<CanvasNodeData>[];
  edges: Edge<CanvasEdgeData>[];

  // UI state
  isSaving: boolean;
  selectedNodeId: string | null;
  connectMode: boolean;

  // Actions
  setCanvasId: (id: string | null) => void;
  setCanvasTitle: (title: string) => void;
  setDirty: (dirty: boolean) => void;
  setSaving: (saving: boolean) => void;
  setSelectedNodeId: (id: string | null) => void;
  toggleConnectMode: () => void;

  // React Flow handlers
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  // Node CRUD
  addNode: (type: CanvasNodeData['type']) => void;
  removeSelectedNode: () => void;
  updateNodeData: (nodeId: string, data: Partial<CanvasNodeData>) => void;

  // Load/reset
  loadCanvas: (data: CanvasData) => void;
  getCanvasData: () => CanvasData;
  reset: () => void;
}

let nodeCounter = 0;

export const useCanvasStore = create<CanvasStore>()((set, get) => ({
  canvasId: null,
  canvasTitle: 'Untitled Canvas',
  isDirty: false,
  nodes: [],
  edges: [],
  isSaving: false,
  selectedNodeId: null,
  connectMode: false,

  setCanvasId: (id) => set({ canvasId: id }),
  setCanvasTitle: (title) => set({ canvasTitle: title, isDirty: true }),
  setDirty: (dirty) => set({ isDirty: dirty }),
  setSaving: (saving) => set({ isSaving: saving }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  toggleConnectMode: () => set((s) => ({ connectMode: !s.connectMode })),

  onNodesChange: (changes) =>
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes) as Node<CanvasNodeData>[],
      isDirty: true,
    })),

  onEdgesChange: (changes) =>
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges) as Edge<CanvasEdgeData>[],
      isDirty: true,
    })),

  onConnect: (connection) =>
    set((state) => ({
      edges: addEdge(
        { ...connection, type: 'styled', animated: false },
        state.edges,
      ),
      isDirty: true,
    })),

  addNode: (type) => {
    nodeCounter += 1;
    const id = `${type}-${nodeCounter}`;
    const now = new Date().toISOString();

    let data: CanvasNodeData;
    switch (type) {
      case 'textBlock':
        data = { type: 'textBlock', label: `Text ${nodeCounter}`, content: '', updatedAt: now };
        break;
      case 'imageBlock':
        data = { type: 'imageBlock', label: `Image ${nodeCounter}`, imageUrl: '', updatedAt: now };
        break;
      case 'noteCard':
        data = { type: 'noteCard', label: `Note ${nodeCounter}`, content: '', color: '#fef9c3', updatedAt: now };
        break;
    }

    const newNode: Node<CanvasNodeData> = {
      id,
      type,
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data,
    };

    set((state) => ({
      nodes: [...state.nodes, newNode],
      isDirty: true,
    }));
  },

  removeSelectedNode: () => {
    const { selectedNodeId, nodes, edges } = get();
    if (!selectedNodeId) return;
    set({
      nodes: nodes.filter((n) => n.id !== selectedNodeId),
      edges: edges.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId),
      selectedNodeId: null,
      isDirty: true,
    });
  },

  updateNodeData: (nodeId, partialData) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, ...partialData, updatedAt: new Date().toISOString() } as CanvasNodeData }
          : n,
      ),
      isDirty: true,
    })),

  loadCanvas: (data) =>
    set({
      nodes: data.nodes ?? [],
      edges: data.edges ?? [],
      isDirty: false,
    }),

  getCanvasData: () => {
    const { nodes, edges } = get();
    return { nodes, edges };
  },

  reset: () =>
    set({
      canvasId: null,
      canvasTitle: 'Untitled Canvas',
      isDirty: false,
      nodes: [],
      edges: [],
      isSaving: false,
      selectedNodeId: null,
      connectMode: false,
    }),
}));

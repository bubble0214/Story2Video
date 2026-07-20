import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
import type {
  AssetCategory,
  CanvasNodeData,
  CanvasEdgeData,
  CanvasData,
  LightSettings,
  CameraSettings,
} from '@/types/canvas';

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
  selectedNodeIds: string[];
  connectMode: boolean;

  // Canvas controls
  activeAssetTab: AssetCategory | 'canvas';
  showAssetOnly: boolean;
  gridSnap: boolean;
  viewport: { x: number; y: number; zoom: number };

  // Tool panel state
  activeToolPanel: 'light' | 'camera' | 'threeView' | 'panoramic' | 'characterConfig' | null;

  // Stored script text for scene prompt regeneration
  scriptText: string;
  setCanvasId: (id: string | null) => void;
  setCanvasTitle: (title: string) => void;
  setDirty: (dirty: boolean) => void;
  setSaving: (saving: boolean) => void;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  toggleConnectMode: () => void;
  setScriptText: (text: string) => void;
  setActiveAssetTab: (tab: AssetCategory | 'canvas') => void;
  toggleGridSnap: () => void;
  toggleAssetOnly: () => void;
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  resetViewport: () => void;
  focusOnNode: (nodeId: string) => void;
  organizeCanvas: () => void;

  // Tool panel
  setActiveToolPanel: (panel: 'light' | 'camera' | 'threeView' | 'panoramic' | 'characterConfig' | null) => void;

  // React Flow handlers
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  // Node CRUD
  addNode: (type: CanvasNodeData['type'], initialData?: Partial<CanvasNodeData>) => void;
  removeSelectedNode: () => void;
  removeNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, data: Partial<CanvasNodeData>) => void;
  setLightSettings: (nodeId: string, settings: Partial<LightSettings>) => void;
  setCameraSettings: (nodeId: string, settings: Partial<CameraSettings>) => void;
  applyImageToCharacter: (nodeId: string, imageUrl: string) => void;
  applyImageToScene: (nodeId: string, imageUrl: string) => void;

  // Load/reset
  loadCanvas: (data: CanvasData) => void;
  getCanvasData: () => CanvasData;
  reset: () => void;

  // Batch operations
  batchGenerate: (nodeIds?: string[]) => void;
  getNodesByCategory: (category: AssetCategory) => Node<CanvasNodeData>[];
}

let nodeCounter = 0;

export const useCanvasStore = create<CanvasStore>()(
  persist(
    (set, get) => ({
      canvasId: null,
      canvasTitle: 'Untitled Canvas',
      isDirty: false,
      nodes: [],
      edges: [],
      isSaving: false,
      selectedNodeId: null,
      selectedNodeIds: [],
      connectMode: false,
      activeAssetTab: 'canvas',
      showAssetOnly: false,
      gridSnap: true,
      viewport: { x: 0, y: 0, zoom: 1 },
      activeToolPanel: null,
      scriptText: '',

      setCanvasId: (id) => set({ canvasId: id }),
      setCanvasTitle: (title) => set({ canvasTitle: title, isDirty: true }),
      setDirty: (dirty) => set({ isDirty: dirty }),
      setSaving: (saving) => set({ isSaving: saving }),
      setSelectedNodeId: (id) => set({ selectedNodeId: id }),
      setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),
      toggleConnectMode: () => set((s) => ({ connectMode: !s.connectMode })),
      setScriptText: (text) => set({ scriptText: text }),
      setActiveAssetTab: (tab) => set({ activeAssetTab: tab }),
      toggleGridSnap: () => set((s) => ({ gridSnap: !s.gridSnap })),
      toggleAssetOnly: () => set((s) => ({ showAssetOnly: !s.showAssetOnly })),
      setViewport: (viewport) => set({ viewport }),
      resetViewport: () => set({ viewport: { x: 0, y: 0, zoom: 1 } }),
      focusOnNode: (nodeId) => {
        // Focus is handled by ReactFlow's fitView or setCenter
        // This just selects the node for now
        set({ selectedNodeId: nodeId });
      },
      setActiveToolPanel: (panel) => set({ activeToolPanel: panel }),
      organizeCanvas: () => {
        const { nodes } = get();
        const grouped: Record<string, Node<CanvasNodeData>[]> = {};
        for (const node of nodes) {
          const group = node.data.type;
          if (!grouped[group]) grouped[group] = [];
          grouped[group].push(node);
        }

        const newNodes = nodes.map((node) => {
          const group = node.data.type;
          const groupNodes = grouped[group]!;
          const idx = groupNodes.findIndex((n) => n.id === node.id);
          const col = Math.floor(idx / 4);
          const row = idx % 4;
          const groupOffset = (() => {
            let i = 0;
            let acc = 0;
            for (const key of Object.keys(grouped)) {
              if (key === group) break;
              acc += grouped[key]!.length;
              i++;
            }
            return i * 400;
          })();

          return {
            ...node,
            position: { x: 100 + col * 220 + groupOffset, y: 100 + row * 160 },
          };
        });

        set({ nodes: newNodes, isDirty: true });
      },

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

      addNode: (type, initialData) => {
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
          case 'character':
            data = { type: 'character', label: `Character ${nodeCounter}`, characterName: `未命名角色 ${nodeCounter}`, updatedAt: now };
            break;
          case 'scene':
            data = { type: 'scene', label: `Scene ${nodeCounter}`, sceneName: `未命名场景 ${nodeCounter}`, updatedAt: now };
            break;
          case 'videoBlock':
            data = { type: 'videoBlock', label: `Video ${nodeCounter}`, updatedAt: now };
            break;
          case 'audioBlock':
            data = { type: 'audioBlock', label: `Audio ${nodeCounter}`, updatedAt: now };
            break;
          default:
            data = { type: 'textBlock', label: `Text ${nodeCounter}`, content: '', updatedAt: now } as CanvasNodeData;
        }

        if (initialData) {
          data = { ...data, ...initialData, updatedAt: now } as CanvasNodeData;
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

      removeNode: (nodeId) => {
        const { nodes, edges } = get();
        set({
          nodes: nodes.filter((n) => n.id !== nodeId),
          edges: edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
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

      setLightSettings: (nodeId, settings) =>
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, lightSettings: { ...(n.data as any).lightSettings ?? {}, ...settings } } as CanvasNodeData }
              : n,
          ),
          isDirty: true,
        })),

      setCameraSettings: (nodeId, settings) =>
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, cameraSettings: { ...(n.data as any).cameraSettings ?? {}, ...settings } } as CanvasNodeData }
              : n,
          ),
          isDirty: true,
        })),

      applyImageToCharacter: (nodeId, imageUrl) =>
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, image: imageUrl, imageUrl } as CanvasNodeData }
              : n,
          ),
          isDirty: true,
        })),

      applyImageToScene: (nodeId, imageUrl) =>
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, image: imageUrl, imageUrl } as CanvasNodeData }
              : n,
          ),
          isDirty: true,
        })),

      loadCanvas: (data) =>
        set({
          nodes: data.nodes ?? [],
          edges: data.edges ?? [],
          viewport: data.viewport ?? { x: 0, y: 0, zoom: 1 },
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
          selectedNodeIds: [],
          connectMode: false,
          activeAssetTab: 'canvas',
          showAssetOnly: false,
          gridSnap: true,
          viewport: { x: 0, y: 0, zoom: 1 },
          activeToolPanel: null,
          scriptText: '',
        }),

      batchGenerate: (nodeIds) => {
        // Placeholder: batch generate for selected nodes or all of a category
        // Will be connected to backend generation API
        const { selectedNodeIds } = get();
        const ids = nodeIds ?? selectedNodeIds;
        if (ids.length === 0) return;
        // TODO: call backend batch generation API
      },

      getNodesByCategory: (category) => {
        const { nodes } = get();
        const typeMap: Record<AssetCategory, string[]> = {
          character: ['character'],
          scene: ['scene'],
          prop: ['imageBlock', 'videoBlock'],
          material: ['textBlock', 'noteCard', 'audioBlock'],
        };
        return nodes.filter((n) => typeMap[category]?.includes(n.type ?? ''));
      },
    }),
    {
      name: 'canvas-storage',
      version: 1,
      partialize: (state) => ({
        canvasId: state.canvasId,
        canvasTitle: state.canvasTitle,
      }),
    },
  ),
);
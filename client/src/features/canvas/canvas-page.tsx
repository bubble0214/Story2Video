'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { canvasesApi } from '@/services/canvases';
import { useCanvasStore } from '@/stores/canvas-store';
import { useAuthStore } from '@/stores/auth-store';
import { CanvasToolbar } from './canvas-toolbar';
import { CanvasArea } from './canvas-area';
import { NodePanel } from './node-panel';
import { CanvasListSheet } from './canvas-list-sheet';
import { AssetList } from './canvas-asset-list';
import { CanvasLeftPanel } from './canvas-left-panel';
import { LightControl } from './tools/light-control';
import { CameraControl } from './tools/camera-control';
import { ThreeViewPanel } from './tools/three-view';
import { PanoramicPanel } from './tools/panoramic';
import { AssetCategory } from '@/types/canvas';
import {
  User,
  Mountain,
  Box,
  FileText,
  LayoutGrid,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const TABS = [
  { key: 'character' as AssetCategory, label: '角色', Icon: User },
  { key: 'scene' as AssetCategory, label: '场景', Icon: Mountain },
  { key: 'prop' as AssetCategory, label: '道具', Icon: Box },
  { key: 'material' as AssetCategory, label: '素材', Icon: FileText },
  { key: 'canvas' as const, label: '画布', Icon: LayoutGrid },
];

export function CanvasPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // zustand persist may not have hydrated on first render
    // Check if we have a stored token to determine if we should show canvas
    const stored = localStorage.getItem('auth-storage');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed?.state?.isAuthenticated) {
          useAuthStore.setState({ isAuthenticated: true, token: parsed.state.token, refreshToken: parsed.state.refreshToken });
        }
      } catch {}
    }
    setHydrated(true);
  }, []);

  const {
    canvasId,
    setCanvasId,
    setDirty,
    isDirty,
    isSaving,
    setSaving,
    getCanvasData,
    canvasTitle,
    nodes,
    activeAssetTab,
    setActiveAssetTab,
  } = useCanvasStore();

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef(false);

  // Create initial canvas on first mount
  const createMutation = useMutation({
    mutationFn: () => canvasesApi.create({ title: 'Untitled Canvas' }),
    onSuccess: ({ data }) => {
      setCanvasId(data.id);
    },
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ReturnType<typeof getCanvasData> }) =>
      canvasesApi.update(id, { data }),
    onSuccess: () => {
      setDirty(false);
      setSaving(false);
      if (pendingSave.current) {
        pendingSave.current = false;
      }
    },
    onError: () => {
      setSaving(false);
      toast({ title: 'Failed to save canvas', variant: 'destructive' });
    },
  });

  // Create a canvas for authenticated users on first mount
  useEffect(() => {
    if (isAuthenticated && !canvasId && !createMutation.isPending) {
      createMutation.mutate();
    }
  }, [isAuthenticated, canvasId]);

  const doSave = () => {
    const id = useCanvasStore.getState().canvasId;
    if (!id) return;
    setSaving(true);
    const data = getCanvasData();
    saveMutation.mutate({ id, data });
  };

  // Auto-save debounce
  useEffect(() => {
    if (!isDirty || !canvasId) return;

    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }

    autoSaveTimer.current = setTimeout(() => {
      doSave();
    }, 5000);

    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
    };
  }, [isDirty, nodes, canvasTitle, canvasId]);

  // Flush save on unmount
  useEffect(() => {
    return () => {
      if (useCanvasStore.getState().isDirty && useCanvasStore.getState().canvasId) {
        const id = useCanvasStore.getState().canvasId!;
        const data = useCanvasStore.getState().getCanvasData();
        navigator.sendBeacon(
          `/api/v1/canvases/${id}`,
          JSON.stringify({ data }),
        );
      }
    };
  }, []);

  // Wait for zustand persist to hydrate before checking auth
  if (!hydrated) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">
          Please login to use the canvas
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center">
        <CanvasToolbar />
        <div className="px-2">
          <CanvasListSheet />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b bg-muted/20 px-2">
        {TABS.map((tab) => {
          const Icon = tab.Icon;
          const isActive = activeAssetTab === tab.key;
          return (
            <button
              key={tab.key}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors ${
                isActive
                  ? 'border-primary text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveAssetTab(tab.key)}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {activeAssetTab === 'canvas' ? (
          <>
            <CanvasLeftPanel />
            <CanvasArea />
            <NodePanel />
          </>
        ) : (
          <AssetList category={activeAssetTab as AssetCategory} />
        )}
      </div>

      {/* Tool Panels */}
      <LightControl />
      <CameraControl />
      <ThreeViewPanel />
      <PanoramicPanel />
    </div>
  );
}
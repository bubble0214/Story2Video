'use client';

import { useEffect, useState } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

  // Save name dialog
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [pendingName, setPendingName] = useState('');

  // Load existing canvas from store (persisted canvasId) or create a new one
  const loadMutation = useMutation({
    mutationFn: (id: string) => canvasesApi.get(id),
    onSuccess: ({ data: canvas }) => {
      const prevScriptText = useCanvasStore.getState().scriptText;
      useCanvasStore.getState().reset();
      useCanvasStore.getState().setCanvasId(canvas.id);
      useCanvasStore.getState().setCanvasTitle(canvas.title);
      if (prevScriptText) {
        useCanvasStore.getState().setScriptText(prevScriptText);
      }
      if (canvas.data) {
        useCanvasStore.getState().loadCanvas(canvas.data);
      }
    },
    onError: () => {
      // Canvas was deleted or inaccessible, create a new one
      if (!createMutation.isPending) {
        createMutation.mutate();
      }
    },
  });

  // Create initial canvas on first mount
  const createMutation = useMutation({
    mutationFn: () => canvasesApi.create({ title: 'Untitled Canvas' }),
    onSuccess: ({ data }) => {
      setCanvasId(data.id);
    },
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, data, title }: { id: string; data: ReturnType<typeof getCanvasData>; title?: string }) =>
      canvasesApi.update(id, { data, title }),
    onSuccess: () => {
      setDirty(false);
      setSaving(false);
    },
    onError: () => {
      setSaving(false);
      toast({ title: 'Failed to save canvas', variant: 'destructive' });
    },
  });

  // Initialize canvas on mount: load existing or create new
  useEffect(() => {
    if (!isAuthenticated) return;

    if (canvasId) {
      // Persisted canvasId found — load that canvas
      if (!loadMutation.isPending) {
        loadMutation.mutate(canvasId);
      }
    } else {
      // No persisted canvasId — create a new one
      if (!createMutation.isPending) {
        createMutation.mutate();
      }
    }
  }, [isAuthenticated, canvasId]);

  const doSave = () => {
    const store = useCanvasStore.getState();
    const id = store.canvasId;
    if (!id) return;

    console.log('[doSave] canvasTitle:', JSON.stringify(store.canvasTitle), 'isDefault:', store.canvasTitle === 'Untitled Canvas');

    // If title is still default, show name dialog
    if (store.canvasTitle === 'Untitled Canvas' || !store.canvasTitle.trim()) {
      console.log('[doSave] showing name dialog');
      setPendingName('');
      setShowNameDialog(true);
      return;
    }

    setSaving(true);
    saveMutation.mutate({ id, data: store.getCanvasData(), title: store.canvasTitle });
  };

  const handleSaveWithName = () => {
    const name = pendingName.trim();
    if (!name) return;
    const store = useCanvasStore.getState();
    const id = store.canvasId;
    if (!id) return;
    store.setCanvasTitle(name);
    setShowNameDialog(false);
    setSaving(true);
    saveMutation.mutate({ id, data: store.getCanvasData(), title: name });
  };

  // Manual save: watch manualSaveSignal from toolbar
  const manualSaveSignal = useCanvasStore((s) => s.manualSaveSignal);
  useEffect(() => {
    if (manualSaveSignal > 0) {
      doSave();
    }
  }, [manualSaveSignal]);

  // Flush save on unmount
  useEffect(() => {
    return () => {
      const store = useCanvasStore.getState();
      if (store.isDirty && store.canvasId) {
        const id = store.canvasId;
        const data = store.getCanvasData();
        navigator.sendBeacon(
          `/api/v1/canvases/${id}`,
          JSON.stringify({ data, title: store.canvasTitle }),
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

      {/* Save name dialog */}
      <Dialog open={showNameDialog} onOpenChange={setShowNameDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>保存画布</DialogTitle>
            <DialogDescription>请输入画布名称</DialogDescription>
          </DialogHeader>
          <Input
            className="h-9 text-sm"
            placeholder="输入画布名称..."
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveWithName();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNameDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSaveWithName}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
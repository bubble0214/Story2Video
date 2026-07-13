'use client';

import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from '@/stores/canvas-store';
import {
  Maximize,
  LayoutGrid,
  Layers,
  Map,
  Grid3X3,
  Minus,
  Plus,
  User,
  Mountain,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export function CanvasBottomControl() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const {
    gridSnap,
    showAssetOnly,
    viewport,
    toggleGridSnap,
    toggleAssetOnly,
    resetViewport,
    organizeCanvas,
  } = useCanvasStore();

  return (
    <div className="absolute bottom-4 left-4 flex items-center gap-1 bg-background border rounded-lg shadow-sm px-1.5 py-1 z-10">
      {/* Reset viewport */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        title="重置视角"
        onClick={resetViewport}
      >
        <Maximize className="h-3.5 w-3.5" />
      </Button>

      {/* Organize canvas */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        title="整理画布"
        onClick={organizeCanvas}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
      </Button>

      {/* Show asset only */}
      <Button
        variant={showAssetOnly ? 'secondary' : 'ghost'}
        size="sm"
        className="h-7 w-7 p-0"
        title="只展示角色/场景"
        onClick={toggleAssetOnly}
      >
        {showAssetOnly ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <Layers className="h-3.5 w-3.5" />
        )}
      </Button>

      {/* MiniMap toggle - handled by CSS visibility */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        title="小地图"
        onClick={() => {
          // MiniMap visibility is controlled via CSS
          const minimap = document.querySelector('.react-flow__minimap');
          if (minimap) {
            minimap.classList.toggle('hidden');
          }
        }}
      >
        <Map className="h-3.5 w-3.5" />
      </Button>

      {/* Grid snap */}
      <Button
        variant={gridSnap ? 'secondary' : 'ghost'}
        size="sm"
        className="h-7 w-7 p-0"
        title="网格吸附"
        onClick={toggleGridSnap}
      >
        <Grid3X3 className="h-3.5 w-3.5" />
      </Button>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      {/* Zoom */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => zoomOut()}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <span className="text-xs font-medium min-w-[36px] text-center">
        {Math.round(viewport.zoom * 100)}%
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => zoomIn()}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
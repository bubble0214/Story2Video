'use client';

import { useCanvasStore } from '@/stores/canvas-store';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Sun, X, Loader2 } from 'lucide-react';
import type { LightSettings } from '@/types/canvas';

export function LightControl() {
  const {
    nodes,
    selectedNodeId,
    setLightSettings,
    setSelectedNodeId,
    setActiveToolPanel,
  } = useCanvasStore();

  const node = nodes.find((n) => n.id === selectedNodeId);
  const lightSettings = node?.data ? ((node.data as any).lightSettings ?? {}) : {};

  const isOpen = useCanvasStore((s) => s.activeToolPanel === 'light');

  const handleClose = () => {
    setActiveToolPanel(null);
    setSelectedNodeId(null);
  };

  const handleSave = () => {
    if (!selectedNodeId) return;
    setLightSettings(selectedNodeId, {
      horizontal: lightSettings.horizontal,
      vertical: lightSettings.vertical,
      intensity: lightSettings.intensity,
      fill: lightSettings.fill,
      colorTemp: lightSettings.colorTemp,
      prompt: lightSettings.prompt,
    });
    handleClose();
  };

  if (!selectedNodeId || !node) return null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Sun className="h-5 w-5" />
            <SheetTitle>光影控制</SheetTitle>
          </div>
          <p className="text-xs text-muted-foreground">{node.data.label}</p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-1 py-4 space-y-4">
          {/* Preview */}
          <div className="aspect-square bg-muted rounded-lg flex items-center justify-center relative">
            <div className="flex items-center justify-center">
              <Sun className="h-8 w-8 text-muted-foreground/30" />
            </div>
            {/* Light direction indicator */}
            <div
              className="absolute w-3 h-3 rounded-full bg-yellow-400"
              style={{
                left: `${50 + (lightSettings.horizontal ?? 0) * 0.3}%`,
                top: `${50 - (lightSettings.vertical ?? 0) * 0.3}%`,
                transform: 'translate(-50%, -50%)',
              }}
            />
          </div>

          {/* Horizontal */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">水平</Label>
              <span className="text-[10px] text-muted-foreground">
                {(lightSettings.horizontal ?? 0).toFixed(0)}°
              </span>
            </div>
            <Slider
              min={-90}
              max={90}
              step={1}
              value={[lightSettings.horizontal ?? 0]}
              onValueChange={(v) => setLightSettings(selectedNodeId, { horizontal: v[0] })}
            />
          </div>

          {/* Vertical */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">垂直</Label>
              <span className="text-[10px] text-muted-foreground">
                {(lightSettings.vertical ?? 0).toFixed(0)}°
              </span>
            </div>
            <Slider
              min={-90}
              max={90}
              step={1}
              value={[lightSettings.vertical ?? 0]}
              onValueChange={(v) => setLightSettings(selectedNodeId, { vertical: v[0] })}
            />
          </div>

          {/* Intensity */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">强度</Label>
              <span className="text-[10px] text-muted-foreground">
                {((lightSettings.intensity ?? 50) / 100 * 100).toFixed(0)}%
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[lightSettings.intensity ?? 50]}
              onValueChange={(v) => setLightSettings(selectedNodeId, { intensity: v[0] })}
            />
          </div>

          {/* Fill */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">底光</Label>
              <span className="text-[10px] text-muted-foreground">
                {((lightSettings.fill ?? 30) / 100 * 100).toFixed(0)}%
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[lightSettings.fill ?? 30]}
              onValueChange={(v) => setLightSettings(selectedNodeId, { fill: v[0] })}
            />
          </div>

          {/* Color temperature */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">色温</Label>
              <span className="text-[10px] text-muted-foreground">
                {(lightSettings.colorTemp ?? 5500).toFixed(0)}K
              </span>
            </div>
            <Slider
              min={2000}
              max={10000}
              step={100}
              value={[lightSettings.colorTemp ?? 5500]}
              onValueChange={(v) => setLightSettings(selectedNodeId, { colorTemp: v[0] })}
            />
          </div>

          {/* Prompt */}
          <div className="space-y-1">
            <Label className="text-xs">提示词</Label>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
              value={lightSettings.prompt ?? ''}
              onChange={(e) => setLightSettings(selectedNodeId, { prompt: e.target.value })}
              placeholder="输入光影描述..."
              rows={2}
            />
          </div>
        </div>

        <SheetFooter className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={handleClose}>
            <X className="h-3.5 w-3.5 mr-1" />
            取消
          </Button>
          <Button size="sm" className="flex-1" onClick={handleSave}>
            保存
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
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
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Camera, X } from 'lucide-react';
import type { CameraSettings } from '@/types/canvas';

const SHOT_OPTIONS = [
  { value: '', label: '选择景别' },
  { value: 'extreme-wide', label: '大远景' },
  { value: 'wide', label: '远景' },
  { value: 'medium-wide', label: '全景' },
  { value: 'medium', label: '中景' },
  { value: 'medium-close', label: '中近景' },
  { value: 'close', label: '近景' },
  { value: 'close-up', label: '特写' },
  { value: 'extreme-close-up', label: '大特写' },
];

const COMPOSITION_OPTIONS = [
  { value: '', label: '选择构图' },
  { value: 'rule-of-thirds', label: '三分法' },
  { value: 'centered', label: '中心' },
  { value: 'symmetrical', label: '对称' },
  { value: 'diagonal', label: '对角线' },
  { value: 'triangle', label: '三角' },
  { value: 'linear', label: '线性' },
];

export function CameraControl() {
  const {
    nodes,
    selectedNodeId,
    setCameraSettings,
    setSelectedNodeId,
    setActiveToolPanel,
  } = useCanvasStore();

  const node = nodes.find((n) => n.id === selectedNodeId);
  const cameraSettings = node?.data ? ((node.data as any).cameraSettings ?? {}) : {};

  const isOpen = useCanvasStore((s) => s.activeToolPanel === 'camera');

  const handleClose = () => {
    setActiveToolPanel(null);
    setSelectedNodeId(null);
  };

  const handleSave = () => {
    if (!selectedNodeId) return;
    setCameraSettings(selectedNodeId, {
      horizontal: cameraSettings.horizontal,
      vertical: cameraSettings.vertical,
      shot: cameraSettings.shot,
      composition: cameraSettings.composition,
      prompt: cameraSettings.prompt,
    });
    handleClose();
  };

  if (!selectedNodeId || !node) return null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            <SheetTitle>镜头控制</SheetTitle>
          </div>
          <p className="text-xs text-muted-foreground">{node.data.label}</p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-1 py-4 space-y-4">
          {/* Preview */}
          <div className="aspect-video bg-muted rounded-lg flex items-center justify-center relative">
            <div className="flex items-center justify-center">
              <Camera className="h-8 w-8 text-muted-foreground/30" />
            </div>
            {/* Camera direction indicator */}
            <div
              className="absolute w-3 h-3 rounded-full bg-blue-400"
              style={{
                left: `${50 + (cameraSettings.horizontal ?? 0) * 0.2}%`,
                top: `${50 - (cameraSettings.vertical ?? 0) * 0.2}%`,
                transform: 'translate(-50%, -50%)',
              }}
            />
          </div>

          {/* Horizontal */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">水平</Label>
              <span className="text-[10px] text-muted-foreground">
                {(cameraSettings.horizontal ?? 0).toFixed(0)}°
              </span>
            </div>
            <Slider
              min={-90}
              max={90}
              step={1}
              value={[cameraSettings.horizontal ?? 0]}
              onValueChange={(v) => setCameraSettings(selectedNodeId, { horizontal: v[0] })}
            />
          </div>

          {/* Vertical */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">垂直</Label>
              <span className="text-[10px] text-muted-foreground">
                {(cameraSettings.vertical ?? 0).toFixed(0)}°
              </span>
            </div>
            <Slider
              min={-45}
              max={45}
              step={1}
              value={[cameraSettings.vertical ?? 0]}
              onValueChange={(v) => setCameraSettings(selectedNodeId, { vertical: v[0] })}
            />
          </div>

          {/* Shot type */}
          <div className="space-y-1">
            <Label className="text-xs">景别</Label>
            <div className="grid grid-cols-3 gap-1">
              {SHOT_OPTIONS.filter((o) => o.value).map((opt) => (
                <Button
                  key={opt.value}
                  variant={cameraSettings.shot === opt.value ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => setCameraSettings(selectedNodeId, { shot: opt.value })}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Composition */}
          <div className="space-y-1">
            <Label className="text-xs">构图</Label>
            <div className="grid grid-cols-3 gap-1">
              {COMPOSITION_OPTIONS.filter((o) => o.value).map((opt) => (
                <Button
                  key={opt.value}
                  variant={cameraSettings.composition === opt.value ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => setCameraSettings(selectedNodeId, { composition: opt.value })}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div className="space-y-1">
            <Label className="text-xs">提示词</Label>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
              value={cameraSettings.prompt ?? ''}
              onChange={(e) => setCameraSettings(selectedNodeId, { prompt: e.target.value })}
              placeholder="输入镜头描述..."
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
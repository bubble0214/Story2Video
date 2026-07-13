'use client';

import { useState } from 'react';
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
import { Globe, Loader2, Mountain, X, Sparkles } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export function PanoramicPanel() {
  const {
    nodes,
    selectedNodeId,
    updateNodeData,
    setSelectedNodeId,
  } = useCanvasStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [panoramicUrl, setPanoramicUrl] = useState<string>('');

  const node = nodes.find((n) => n.id === selectedNodeId);
  const sceneName = (node?.data as any)?.sceneName ?? (node?.data as any)?.label;

  const isOpen = useCanvasStore((s) => s.activeToolPanel === 'panoramic') && (node?.data?.type === 'scene');

  const handleClose = () => {
    useCanvasStore.getState().setActiveToolPanel(null);
    setSelectedNodeId(null);
  };

  const handleGenerate = async () => {
    if (!selectedNodeId) return;
    setIsGenerating(true);
    try {
      // TODO: Call backend API to generate panoramic image
      await new Promise((resolve) => setTimeout(resolve, 2000));
      toast({ title: '全景图生成完成', description: '已生成360度全景图' });
      setPanoramicUrl('/placeholder-panoramic.png');
    } catch {
      toast({ title: '生成失败', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApply = () => {
    if (!selectedNodeId || !panoramicUrl) return;
    updateNodeData(selectedNodeId, { panoramicUrl } as any);
    handleClose();
    toast({ title: '已应用全景图', description: '全景图已应用到场景节点' });
  };

  if (!selectedNodeId || !node || node.data?.type !== 'scene') return null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            <SheetTitle>全景图</SheetTitle>
          </div>
          <p className="text-xs text-muted-foreground">{sceneName}</p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-1 py-4 space-y-4">
          {/* Preview */}
          <div className="aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden relative">
            {panoramicUrl ? (
              <img src={panoramicUrl} alt="" className="w-full h-full object-cover" />
            ) : (node.data as any).panoramicUrl ? (
              <img src={(node.data as any).panoramicUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Mountain className="h-8 w-8 opacity-30" />
                <span className="text-xs">待生成</span>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label className="text-xs">场景描述</Label>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
              value={(node.data as any).description ?? ''}
              onChange={(e) => updateNodeData(selectedNodeId, { description: e.target.value } as any)}
              placeholder="输入场景环境描述..."
              rows={3}
            />
          </div>
        </div>

        <SheetFooter className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={handleClose}>
            <X className="h-3.5 w-3.5 mr-1" />
            取消
          </Button>
          {panoramicUrl ? (
            <Button size="sm" className="flex-1" onClick={handleApply}>
              应用全景图
            </Button>
          ) : (
            <Button size="sm" className="flex-1" onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  生成全景图
                </>
              )}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
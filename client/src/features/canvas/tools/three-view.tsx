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
import { Image, Loader2, User, X, Sparkles } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export function ThreeViewPanel() {
  const {
    nodes,
    selectedNodeId,
    updateNodeData,
    setSelectedNodeId,
    setActiveToolPanel,
  } = useCanvasStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);

  const node = nodes.find((n) => n.id === selectedNodeId);
  const characterName = (node?.data as any)?.characterName ?? (node?.data as any)?.label;

  const isOpen = useCanvasStore((s) => s.activeToolPanel === 'threeView') && (node?.data?.type === 'character');

  const handleClose = () => {
    setActiveToolPanel(null);
    setSelectedNodeId(null);
    setGeneratedImages([]);
  };

  const handleGenerate = async () => {
    if (!selectedNodeId) return;
    setIsGenerating(true);
    try {
      // TODO: Call backend API to generate three-view images
      // For now, show a toast and simulate loading
      await new Promise((resolve) => setTimeout(resolve, 2000));
      toast({ title: '三视图生成完成', description: '已生成正面、侧面、背面视图' });
      // In real implementation, this would return image URLs
      setGeneratedImages(['/placeholder-front.png', '/placeholder-side.png', '/placeholder-back.png']);
    } catch {
      toast({ title: '生成失败', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyMainImage = (imageUrl: string) => {
    if (!selectedNodeId) return;
    updateNodeData(selectedNodeId, { image: imageUrl, imageUrl } as any);
    handleClose();
    toast({ title: '已应用主图', description: '三视图已应用到角色节点' });
  };

  if (!selectedNodeId || !node || node.data?.type !== 'character') return null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            <SheetTitle>角色三视图</SheetTitle>
          </div>
          <p className="text-xs text-muted-foreground">{characterName}</p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-1 py-4 space-y-4">
          {/* Preview area */}
          <div className="space-y-3">
            {generatedImages.length > 0 ? (
              generatedImages.map((url, idx) => (
                <div key={idx} className="space-y-1">
                  <Label className="text-xs">
                    {idx === 0 ? '正面' : idx === 1 ? '侧面' : '背面'}
                  </Label>
                  <div className="aspect-square bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </div>
                </div>
              ))
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {['正面', '侧面', '背面'].map((label) => (
                  <div key={label} className="space-y-1">
                    <Label className="text-xs text-center">{label}</Label>
                    <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
                      <User className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label className="text-xs">角色描述</Label>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
              value={(node.data as any).description ?? ''}
              onChange={(e) => updateNodeData(selectedNodeId, { description: e.target.value } as any)}
              placeholder="输入角色外观描述..."
              rows={3}
            />
          </div>
        </div>

        <SheetFooter className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={handleClose}>
            <X className="h-3.5 w-3.5 mr-1" />
            取消
          </Button>
          {generatedImages.length > 0 ? (
            <Button size="sm" className="flex-1" onClick={() => handleApplyMainImage(generatedImages[0])}>
              应用主图
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
                  生成三视图
                </>
              )}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
'use client';

import { useState, useEffect, useRef } from 'react';
import { useCanvasStore } from '@/stores/canvas-store';
import {
  User,
  Mountain,
  Box,
  FileText,
  Plus,
  MoveRight,
  Loader2,
  UserPlus,
  Image,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { Node } from '@xyflow/react';
import type { CanvasNodeData, AssetCategory } from '@/types/canvas';
import { useCanvasParseScript } from '@/hooks/use-canvas-parse-script';

interface AssetCardProps {
  node: Node<CanvasNodeData>;
  onSelect: (id: string) => void;
  onApplyImage: (id: string) => void;
}

function AssetCard({ node, onSelect, onApplyImage }: AssetCardProps) {
  const data = node.data;
  const isCharacter = data.type === 'character';
  const isScene = data.type === 'scene';

  return (
    <div
      className="group rounded-lg border bg-card hover:border-primary/50 transition-colors cursor-pointer overflow-hidden"
      onClick={() => onSelect(node.id)}
    >
      {/* Image area */}
      <div className="aspect-square bg-muted flex items-center justify-center relative">
        {(data as any).image || (data as any).imageUrl ? (
          <img
            src={(data as any).image || (data as any).imageUrl}
            alt={data.label}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onApplyImage(node.id);
              }}
            >
              <Image className="h-4 w-4" />
            </Button>
            <span className="text-xs">待补充</span>
          </div>
        )}

        {/* Apply image button overlay */}
        {(data as any).image && (
          <Button
            variant="secondary"
            size="sm"
            className="h-7 w-7 rounded-full absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onApplyImage(node.id);
            }}
          >
            <Image className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Info */}
      <div className="px-3 py-2 space-y-1">
        <div className="flex items-center justify-between gap-1">
          <p className="text-sm font-medium truncate">{data.label}</p>
          {(isCharacter || isScene) && (data as any).appearanceCount && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              出现{(data as any).appearanceCount}次
            </span>
          )}
        </div>
        {(isCharacter || isScene) && (data as any).description && (
          <p className="text-[10px] text-muted-foreground line-clamp-2">
            {(data as any).description}
          </p>
        )}
      </div>
    </div>
  );
}

interface AssetListProps {
  category: AssetCategory;
}

const CATEGORY_CONFIG: Record<AssetCategory, { label: string; icon: typeof User; nodeTypes: string[] }> = {
  character: { label: '角色', icon: User, nodeTypes: ['character'] },
  scene: { label: '场景', icon: Mountain, nodeTypes: ['scene'] },
  prop: { label: '道具', icon: Box, nodeTypes: ['imageBlock', 'videoBlock'] },
  material: { label: '素材', icon: FileText, nodeTypes: ['textBlock', 'noteCard', 'audioBlock'] },
};

export function AssetList({ category }: AssetListProps) {
  const {
    nodes,
    selectedNodeId,
    setActiveAssetTab,
    addNode,
    focusOnNode,
    updateNodeData,
  } = useCanvasStore();

  const config = CATEGORY_CONFIG[category];
  const assetNodes = nodes.filter((n) => config.nodeTypes.includes(n.type ?? ''));

  const [showParseDialog, setShowParseDialog] = useState(false);
  const [scriptText, setScriptText] = useState('');
  const { parse, isParsing } = useCanvasParseScript();
  const prevParsing = useRef(false);

  // Auto-close dialog when parsing completes
  useEffect(() => {
    if (prevParsing.current && !isParsing && showParseDialog) {
      setShowParseDialog(false);
      setScriptText('');
    }
    prevParsing.current = isParsing;
  }, [isParsing, showParseDialog]);

  const handleSelect = (id: string) => {
    focusOnNode(id);
    setActiveAssetTab('canvas');
  };

  const handleAddNew = () => {
    if (category === 'character') {
      addNode('character');
    } else if (category === 'scene') {
      addNode('scene');
    } else if (category === 'prop') {
      addNode('imageBlock');
    } else {
      addNode('textBlock');
    }
    setActiveAssetTab('canvas');
  };

  const handleApplyImage = (nodeId: string) => {
    // In future, this will open an image generation/upload dialog
    // For now, just select the node
    focusOnNode(nodeId);
    setActiveAssetTab('canvas');
  };

  const handleParseScript = () => {
    if (!scriptText.trim()) return;
    parse({ scriptText: scriptText.trim(), parseType: 'all' });
  };

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <config.icon className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{config.label}</h2>
          <span className="text-xs text-muted-foreground">
            {assetNodes.length} 个
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setActiveAssetTab('canvas')}
          >
            <MoveRight className="h-3.5 w-3.5 mr-1" />
            在画布中编辑
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleAddNew}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            新建{config.label}
          </Button>
        </div>
      </div>

      {/* Grid */}
      {assetNodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <config.icon className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground mb-1">暂无{config.label}</p>
          <p className="text-xs text-muted-foreground/60 mb-4">
            从剧本解析生成，或手动添加
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowParseDialog(true)}>
              <FileText className="h-3.5 w-3.5 mr-1" />
              从剧本解析
            </Button>
            <Button size="sm" onClick={handleAddNew}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              新建{config.label}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {assetNodes.map((node) => (
            <AssetCard
              key={node.id}
              node={node}
              onSelect={handleSelect}
              onApplyImage={handleApplyImage}
            />
          ))}
        </div>
      )}

      {/* Parse from script dialog */}
      <Dialog open={showParseDialog} onOpenChange={(open) => { if (!isParsing) setShowParseDialog(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>从剧本解析生成</DialogTitle>
            <DialogDescription>
              粘贴剧本原文，系统将自动提取角色和场景信息并添加到画布中。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <textarea
              className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
              placeholder="请粘贴剧本内容..."
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              disabled={isParsing}
            />
            {isParsing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在解析中...
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setShowParseDialog(false); setScriptText(''); }}
              disabled={isParsing}
            >
              取消
            </Button>
            <Button onClick={handleParseScript} disabled={isParsing || !scriptText.trim()}>
              {isParsing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  解析中
                </>
              ) : '开始解析'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
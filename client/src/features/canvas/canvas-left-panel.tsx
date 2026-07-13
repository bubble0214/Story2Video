'use client';

import { useCanvasStore } from '@/stores/canvas-store';
import { AssetCategory } from '@/types/canvas';
import {
  User,
  Mountain,
  Type,
  Image,
  Video,
  Music,
  LayoutGrid,
  Plus,
  MoveRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { Node } from '@xyflow/react';
import type { CanvasNodeData } from '@/types/canvas';

const NODE_TYPES = [
  { key: 'character' as const, label: '角色', Icon: User, assetCategory: 'character' as AssetCategory },
  { key: 'scene' as const, label: '场景', Icon: Mountain, assetCategory: 'scene' as AssetCategory },
  { key: 'textBlock' as const, label: '文本', Icon: Type, assetCategory: null },
  { key: 'imageBlock' as const, label: '图片', Icon: Image, assetCategory: null },
  { key: 'videoBlock' as const, label: '视频', Icon: Video, assetCategory: null },
  { key: 'audioBlock' as const, label: '音频', Icon: Music, assetCategory: null },
];

export function CanvasLeftPanel() {
  const {
    nodes,
    addNode,
    setActiveAssetTab,
    selectedNodeId,
    focusOnNode,
  } = useCanvasStore();

  // Get character and scene nodes for the asset library
  const characterNodes = nodes.filter((n) => n.data?.type === 'character' && n.data?.characterName);
  const sceneNodes = nodes.filter((n) => n.data?.type === 'scene' && n.data?.sceneName);

  const handleSelectNode = (id: string) => {
    focusOnNode(id);
    setActiveAssetTab('canvas');
  };

  return (
    <div className="w-48 border-r bg-background flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          添加节点
        </p>
      </div>

      {/* Node creation buttons */}
      <div className="p-2 space-y-1">
        {NODE_TYPES.map((type) => (
          <Button
            key={type.key}
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 h-8 text-xs"
            onClick={() => addNode(type.key)}
          >
            <type.Icon className="h-3.5 w-3.5" />
            {type.label}
          </Button>
        ))}
      </div>

      <Separator />

      {/* Asset library */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            资产库
          </p>
        </div>

        {/* Characters */}
        <div className="px-2 space-y-1">
          <div className="flex items-center justify-between px-1 py-1">
            <div className="flex items-center gap-1 text-xs">
              <User className="h-3 w-3" />
              <span>角色</span>
              <span className="text-muted-foreground">{characterNodes.length}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={() => setActiveAssetTab('character')}
              title="在列表中编辑"
            >
              <MoveRight className="h-3 w-3" />
            </Button>
          </div>
          {characterNodes.map((node) => (
            <button
              key={node.id}
              className={`flex items-center gap-1.5 w-full px-1.5 py-1 text-xs rounded hover:bg-muted transition-colors ${
                selectedNodeId === node.id ? 'bg-muted' : ''
              }`}
              onClick={() => handleSelectNode(node.id)}
            >
              <span className="truncate flex-1 text-left">
                {node.data.characterName as string}
              </span>
            </button>
          ))}
        </div>

        <Separator className="mx-2 my-1" />

        {/* Scenes */}
        <div className="px-2 space-y-1">
          <div className="flex items-center justify-between px-1 py-1">
            <div className="flex items-center gap-1 text-xs">
              <Mountain className="h-3 w-3" />
              <span>场景</span>
              <span className="text-muted-foreground">{sceneNodes.length}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={() => setActiveAssetTab('scene')}
              title="在列表中编辑"
            >
              <MoveRight className="h-3 w-3" />
            </Button>
          </div>
          {sceneNodes.map((node) => (
            <button
              key={node.id}
              className={`flex items-center gap-1.5 w-full px-1.5 py-1 text-xs rounded hover:bg-muted transition-colors ${
                selectedNodeId === node.id ? 'bg-muted' : ''
              }`}
              onClick={() => handleSelectNode(node.id)}
            >
              <span className="truncate flex-1 text-left">
                {node.data.sceneName as string}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useRef, useState, useMemo } from 'react';
import { useCanvasStore } from '@/stores/canvas-store';
import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import {
  Image,
  Sun,
  Camera,
  Globe,
  Download,
  Trash2,
  User,
  FileText,
  Music,
  Video,
  StickyNote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Node } from '@xyflow/react';
import type { CanvasNodeData, CharacterData, SceneData } from '@/types/canvas';
import { toast } from '@/hooks/use-toast';

export function CanvasNodeToolbar() {
  const {
    nodes,
    selectedNodeId,
    removeSelectedNode,
    setActiveToolPanel,
    updateNodeData,
  } = useCanvasStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showAsset, setShowAsset] = useState(false);

  const { data: assetTasks } = useQuery({
    queryKey: ['asset-tasks-toolbar'],
    queryFn: () => tasksApi.list({ limit: 50 }),
    enabled: showAsset,
  });
  const assetItems = useMemo(
    () => (assetTasks?.data?.items ?? []).filter((t) => t.status === 'SUCCESS' && t.result?.result_url),
    [assetTasks],
  );

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node || !node.data) return null;

  const data = node.data;

  const handleLocalUpload = () => {
    if (!selectedNodeId) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      updateNodeData(selectedNodeId, { imageUrl: url } as Partial<CanvasNodeData>);
      toast({ title: '图片已替换' });
    };
    input.click();
  };

  const handleAssetSelect = (url: string) => {
    if (!selectedNodeId) return;
    updateNodeData(selectedNodeId, { imageUrl: url } as Partial<CanvasNodeData>);
    setShowAsset(false);
    toast({ title: '图片已替换' });
  };

  const handleReplaceImage = () => {
    if (!selectedNodeId) return;
    setShowAsset(true);
  };

  // Determine toolbar items based on node type
  const toolbarItems = getToolbarItems(data, setActiveToolPanel, handleReplaceImage);

  return (<>
    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-background border rounded-lg shadow-sm px-1.5 py-1 z-20">
      <div className="flex items-center gap-1 px-2">
        <GetNodeIcon data={data} className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{(data as any).characterName ?? (data as any).sceneName ?? data.label}</span>
      </div>

      <div className="w-px h-5 bg-border mx-0.5" />

      {toolbarItems.map((item) => (
        <Button
          key={item.key}
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={item.onClick}
          disabled={item.disabled}
          title={item.title}
        >
          <item.Icon className="h-3.5 w-3.5" />
          {item.label}
        </Button>
      ))}

      <div className="w-px h-5 bg-border mx-0.5" />

      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
        onClick={() => { if (window.confirm('确定删除此节点吗？')) removeSelectedNode(); }}
        title="删除节点"
      >
        <Trash2 className="h-3.5 w-3.5" />
        删除
      </Button>
    </div>

    {showAsset && (
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 bg-background border rounded-lg shadow-lg p-3 w-72" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium">替换图片</span>
          <button className="text-muted-foreground hover:text-foreground" onClick={() => setShowAsset(false)}><Trash2 className="w-3 h-3 rotate-45" /></button>
        </div>
        <div className="space-y-1.5">
          <button className="w-full text-left px-3 py-2 rounded-md border text-xs hover:bg-accent" onClick={() => { setShowAsset(false); handleLocalUpload(); }}>📁 本地上传</button>
          <div className="text-[10px] text-muted-foreground px-1 pt-1">从资产库选择</div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {assetItems.length === 0 ? (
              <p className="text-[10px] text-muted-foreground text-center py-3">暂无可用资产</p>
            ) : (
              assetItems.map((t) => {
                const url = (t.result as any)?.result_url ?? '';
                return (
                  <button key={t.id} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent text-left" onClick={() => handleAssetSelect(url)}>
                    {url.match(/\.(png|jpg|jpeg|webp|gif)/i) ? (
                      <img src={url} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
                    ) : (
                      <div className="w-8 h-8 bg-muted rounded flex items-center justify-center shrink-0"><FileText className="w-3.5 h-3.5 text-muted-foreground" /></div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-medium truncate">{t.workflow_type}</p>
                      <p className="text-[9px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    )}
  </>);
}

function GetNodeIcon({
  data,
  className,
}: {
  data: CanvasNodeData;
  className: string;
}) {
  switch (data.type) {
    case 'character':
      return <User className={className} />;
    case 'scene':
      return <Globe className={className} />;
    case 'imageBlock':
      return <Image className={className} />;
    case 'videoBlock':
      return <Video className={className} />;
    case 'audioBlock':
      return <Music className={className} />;
    case 'textBlock':
      return <FileText className={className} />;
    case 'noteCard':
      return <StickyNote className={className} />;
    default:
      return <FileText className={className} />;
  }
}

interface ToolbarItem {
  key: string;
  label: string;
  Icon: typeof Image;
  onClick: () => void;
  disabled?: boolean;
  title: string;
}

function getToolbarItems(
  data: CanvasNodeData,
  setActiveToolPanel: (panel: 'light' | 'camera' | 'threeView' | 'panoramic' | null) => void,
  onReplaceImage: () => void,
): ToolbarItem[] {
  const baseItems: ToolbarItem[] = [
    {
      key: 'image',
      label: '图片',
      Icon: Image,
      title: '替换图片',
      onClick: onReplaceImage,
    },
    {
      key: 'download',
      label: '下载',
      Icon: Download,
      title: '下载',
      onClick: () => {},
    },
  ];

  if (data.type === 'character') {
    return [
      {
        key: 'three-view',
        label: '角色三视图',
        Icon: Image,
        title: '生成角色三视图',
        onClick: () => setActiveToolPanel('threeView'),
      },
      {
        key: 'light',
        label: '光影控制',
        Icon: Sun,
        title: '调整光影参数',
        onClick: () => setActiveToolPanel('light'),
      },
      {
        key: 'camera',
        label: '镜头控制',
        Icon: Camera,
        title: '调整镜头参数',
        onClick: () => setActiveToolPanel('camera'),
      },
      {
        key: 'image',
        label: '替换图片',
        Icon: Image,
        title: '替换角色图片',
        onClick: onReplaceImage,
      },
      {
        key: 'download',
        label: '下载',
        Icon: Download,
        title: '下载角色图片',
        onClick: () => {},
      },
    ];
  }

  if (data.type === 'scene') {
    return [
      {
        key: 'panoramic',
        label: '全景图',
        Icon: Globe,
        title: '打开/生成全景图',
        onClick: () => setActiveToolPanel('panoramic'),
      },
      {
        key: 'camera',
        label: '镜头控制',
        Icon: Camera,
        title: '调整镜头参数',
        onClick: () => setActiveToolPanel('camera'),
      },
      {
        key: 'image',
        label: '替换图片',
        Icon: Image,
        title: '替换场景图片',
        onClick: onReplaceImage,
      },
      {
        key: 'download',
        label: '下载',
        Icon: Download,
        title: '下载场景图片',
        onClick: () => {},
      },
    ];
  }

  return baseItems;
}
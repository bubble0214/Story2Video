'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCanvasStore } from '@/stores/canvas-store';
import {
  User,
  Mountain,
  Box,
  FileText,
  Plus,
  MoveRight,
  Loader2,
  Image,
  Upload,
  FolderOpen,
  Clock,
  CheckCircle2,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { Node } from '@xyflow/react';
import type { CanvasNodeData, AssetCategory } from '@/types/canvas';
import { useCanvasParseScript } from '@/hooks/use-canvas-parse-script';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { tasksApi } from '@/services/tasks';
import type { TaskResp } from '@/types/task';

const STYLE_OPTIONS = [
  { value: '真人', label: '真人' },
  { value: '3D', label: '3D' },
  { value: '2D', label: '2D' },
  { value: '水墨风', label: '水墨风' },
  { value: '赛博朋克', label: '赛博朋克' },
  { value: '现代极简', label: '现代极简' },
  { value: '暗黑奇幻', label: '暗黑奇幻' },
  { value: '日系动漫', label: '日系动漫' },
  { value: '欧美写实', label: '欧美写实' },
];

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
      <div className="aspect-[9/16] bg-muted flex items-center justify-center relative">
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
  const [scriptStyle, setScriptStyle] = useState('');
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskResp | null>(null);
  const [selectedScenes, setSelectedScenes] = useState<Set<string>>(new Set());
  const { parse, isParsing, isGeneratingImages, generationProgress } = useCanvasParseScript();
  const prevParsing = useRef(false);

  // Query script-related tasks for asset selection (show both in-progress and completed)
  const scriptAssetsQuery = useQuery({
    queryKey: ['tasks', 'script_assets'],
    queryFn: async () => {
      const resp = await tasksApi.list({ limit: 50 });
      // Filter for script-related workflow types
      return resp.data.items.filter(
        (t: TaskResp) =>
          t.workflow_type === 'generate_script' || t.workflow_type === 'canvas_parse_script'
      );
    },
    enabled: showAssetPicker,
  });

  const SCRIPT_STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    SUCCESS: { label: '已完成', variant: 'default' },
    RUNNING: { label: '进行中', variant: 'secondary' },
    PENDING: { label: '等待中', variant: 'outline' },
    FAILED: { label: '失败', variant: 'destructive' },
  };

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
    parse({ scriptText: scriptText.trim(), parseType: 'all', style: scriptStyle });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) setScriptText(text);
    };
    // Read as GBK to handle Chinese Windows text files; fallback to UTF-8
    reader.readAsText(file, 'GBK');
    // Reset input so re-selecting the same file triggers onChange
    e.target.value = '';
  };

  const handleSelectScriptAsset = (task: TaskResp) => {
    if (task.status !== 'SUCCESS') return;
    const result = task.result as Record<string, unknown> | undefined;
    const scenes = result?.generated_scenes as { num: string; content: string; location?: string; summary?: string }[] | undefined;
    if (scenes && scenes.length > 0) {
      // Has generated scenes — go to scene selection step
      setSelectedTask(task);
      setSelectedScenes(new Set(scenes.map((_, i) => String(i))));
    } else {
      // No scenes (old format or canvas_parse_script) — fill script text and close
      const script = (result?.script_content ?? result?.script ?? '') as string;
      if (script) setScriptText(script);
      setShowAssetPicker(false);
    }
  };

  const handleParseSelectedScenes = () => {
    if (!selectedTask) return;
    const result = selectedTask.result as Record<string, unknown> | undefined;
    const scenes = result?.generated_scenes as { num: string; content: string }[] | undefined;
    if (!scenes || scenes.length === 0) return;
    const selected = Array.from(selectedScenes).map((i) => scenes[Number(i)]).filter(Boolean);
    if (selected.length === 0) return;
    const combinedScript = selected.map((s) => s.content).join('\n\n');
    setScriptText(combinedScript);
    setSelectedTask(null);
    setShowAssetPicker(false);
    // Trigger parse with the combined text
    setTimeout(() => {
      parse({ scriptText: combinedScript.trim(), parseType: 'all', style: scriptStyle });
    }, 100);
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
      <Dialog open={showParseDialog} onOpenChange={(open) => { if (!isParsing && !isGeneratingImages) setShowParseDialog(open); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>从剧本解析生成</DialogTitle>
            <DialogDescription>
              粘贴剧本原文或上传 .txt 文件，系统将自动提取角色和场景信息并添加到画布中。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Style selector */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground shrink-0">风格：</span>
              <Select value={scriptStyle} onValueChange={setScriptStyle} disabled={isParsing}>
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue placeholder="不指定风格" />
                </SelectTrigger>
                <SelectContent>
                  {STYLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* File upload */}
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".txt"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isParsing}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={isParsing}
                  onClick={() => document.querySelector<HTMLInputElement>('input[accept=".txt"]')?.click()}
                  type="button"
                >
                  <Upload className="h-3.5 w-3.5 mr-1" />
                  上传文件
                </Button>
              </label>

              {/* Select from assets */}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={isParsing}
                onClick={() => setShowAssetPicker(true)}
                type="button"
              >
                <FolderOpen className="h-3.5 w-3.5 mr-1" />
                从资产选择
              </Button>
            </div>

            <textarea
              className="flex min-h-[180px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
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
            {isGeneratingImages && generationProgress && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在生成角色图片 {generationProgress.completed + 1}/{generationProgress.total} ...
                <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${((generationProgress.completed) / generationProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setShowParseDialog(false); setScriptText(''); setScriptStyle(''); }}
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

      {/* Script asset picker dialog — two-step: task list then scene selection */}
      <Dialog
        open={showAssetPicker}
        onOpenChange={(open) => {
          if (!open) { setSelectedTask(null); setSelectedScenes(new Set()); }
          setShowAssetPicker(open);
        }}
      >
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          {selectedTask ? (
            <>
              <DialogHeader>
                <DialogTitle>选择场景</DialogTitle>
                <DialogDescription>
                  {(selectedTask.result as Record<string, unknown>)?.title as string ?? '剧本'} —
                  勾选要解析的场景，点击"解析选中场景"导入画布。
                </DialogDescription>
              </DialogHeader>
              {(() => {
                const result = selectedTask.result as Record<string, unknown> | undefined;
                const scenes = result?.generated_scenes as { num: string; content: string; location?: string; summary?: string }[] | undefined;
                if (!scenes || scenes.length === 0) {
                  return <p className="text-sm text-muted-foreground text-center py-8">该剧本没有场景数据</p>;
                }
                const allSelected = selectedScenes.size === scenes.length;
                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{scenes.length} 个场景</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => {
                          if (allSelected) setSelectedScenes(new Set());
                          else setSelectedScenes(new Set(scenes.map((_, i) => String(i))));
                        }}
                      >
                        {allSelected ? '取消全选' : '全选'}
                      </Button>
                    </div>
                    <ScrollArea className="max-h-[320px] pr-3">
                      <div className="space-y-2">
                        {scenes.map((scene, idx) => (
                          <label
                            key={scene.num ?? idx}
                            className="flex items-start gap-3 p-3 rounded-lg border hover:border-primary/50 transition-colors cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedScenes.has(String(idx))}
                              onCheckedChange={() => {
                                const next = new Set(selectedScenes);
                                if (next.has(String(idx))) next.delete(String(idx));
                                else next.add(String(idx));
                                setSelectedScenes(next);
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-primary shrink-0">
                                  第{String(Number(scene.num) + 1)}场
                                </span>
                                {scene.location && (
                                  <Badge variant="outline" className="text-[10px] h-5">
                                    {scene.location}
                                  </Badge>
                                )}
                              </div>
                              {scene.summary && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{scene.summary}</p>
                              )}
                              <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-2">{scene.content}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </ScrollArea>
                    <div className="flex items-center justify-between pt-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => { setSelectedTask(null); setSelectedScenes(new Set()); }}
                      >
                        返回
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={selectedScenes.size === 0}
                        onClick={handleParseSelectedScenes}
                      >
                        解析选中场景 ({selectedScenes.size})
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>选择已有剧本</DialogTitle>
                <DialogDescription>
                  从之前生成或解析中的剧本任务中选择一个。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {scriptAssetsQuery.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : scriptAssetsQuery.data?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">暂无剧本任务</p>
                ) : (
                  scriptAssetsQuery.data?.map((task) => {
                    const result = task.result as Record<string, unknown> | undefined;
                    const scriptContent = (result?.script_content ?? result?.script ?? '') as string;
                    const scriptPreview = scriptContent ? scriptContent.slice(0, 120) + (scriptContent.length > 120 ? '...' : '') : '无剧本内容';
                    const title = (result?.title as string) || (() => {
                      // For canvas_parse_script, derive title from characters
                      const chars = result?.characters as { name?: string }[] | undefined;
                      if (chars && chars.length > 0) {
                        const names = chars.map(c => c.name).filter(Boolean).slice(0, 3);
                        return names.length > 0 ? names.join('、') : '未命名剧本';
                      }
                      return '未命名剧本';
                    })();
                    const statusInfo = SCRIPT_STATUS_MAP[task.status] ?? { label: task.status, variant: 'outline' as const };
                    const isComplete = task.status === 'SUCCESS';
                    return (
                      <button
                        key={task.id}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          isComplete
                            ? 'cursor-pointer hover:border-primary/50'
                            : 'opacity-60 cursor-not-allowed bg-muted/30'
                        }`}
                        onClick={() => handleSelectScriptAsset(task)}
                        disabled={!isComplete}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium truncate">{title}</p>
                          <Badge variant={statusInfo.variant} className="shrink-0 text-[10px] h-5">
                            {isComplete ? <CheckCircle2 className="w-3 h-3 mr-0.5" /> : <Clock className="w-3 h-3 mr-0.5" />}
                            {statusInfo.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {isComplete ? scriptPreview : '任务尚未完成，请稍后再试'}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">
                          {new Date(task.created_at).toLocaleDateString()} · {task.workflow_type === 'canvas_parse_script' ? '剧本解析' : '剧本生成'}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowAssetPicker(false); setSelectedTask(null); setSelectedScenes(new Set()); }}>关闭</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

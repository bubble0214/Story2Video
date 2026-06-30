'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { useWorkflowStore } from '@/stores/workflow-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModelSelector } from '@/components/model-selector';
import { toast } from '@/hooks/use-toast';
import { Loader2, FileText, Upload, BookOpen, Sparkles, ChevronRight, AlertCircle } from 'lucide-react';

const LYRICS_TABS = [
  { value: 'extract', label: '歌曲内核提取', icon: Sparkles },
  { value: 'generate', label: '歌词生成', icon: FileText },
];

export function LyricsPage() {
  const selectedNovelId = useWorkflowStore((s) => s.selectedNovelId);
  const novelContent = useWorkflowStore((s) => s.novelContent);
  const [activeTab, setActiveTab] = useState('extract');

  // Script source: upload or asset library
  const [scriptContent, setScriptContent] = useState('');
  const [scriptSource, setScriptSource] = useState<'upload' | 'asset' | ''>('');

  // Extracted core
  const [extractedCore, setExtractedCore] = useState('');
  const [extractTaskId, setExtractTaskId] = useState<string | null>(null);

  // Upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Model
  const [selectedModel, setSelectedModel] = useState('');

  // ── Extract core ──
  const extractMutation = useMutation({
    mutationFn: async () => {
      const { data } = await tasksApi.create({
        workflow_type: 'extract_lyrics_core',
        input_params: {
          script_content: scriptContent,
          model: selectedModel || undefined,
        },
      });
      return data as { id: string };
    },
    onSuccess: (data) => {
      setExtractTaskId(data.id);
      toast({ title: '开始提取歌曲内核...' });
    },
    onError: (err: Error) => {
      toast({ title: '提取失败', description: err.message, variant: 'destructive' });
    },
  });

  // Poll extract result
  const [pollExtract, setPollExtract] = useState<{ status: string; result?: { lyrics_core_content: string } } | null>(null);

  useEffect(() => {
    if (!extractTaskId) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await tasksApi.get(extractTaskId);
        setPollExtract(data as any);
        if (data.status === 'SUCCESS') {
          clearInterval(interval);
          setExtractTaskId(null);
          const content = (data as any).result?.lyrics_core_content || '';
          setExtractedCore(content);
          toast({ title: '歌曲内核提取完成' });
        } else if (data.status === 'FAILED') {
          clearInterval(interval);
          setExtractTaskId(null);
          toast({ title: '提取失败', description: (data as any).error_message, variant: 'destructive' });
        }
      } catch {
        clearInterval(interval);
        setExtractTaskId(null);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [extractTaskId]);

  // ── File upload ──
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setScriptContent(reader.result as string);
      setScriptSource('upload');
      toast({ title: '剧本已加载' });
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  // ── Use asset script ──
  const handleUseAssetScript = useCallback(() => {
    // In a full implementation, this would open an asset picker modal.
    // For now, uses the stored novel content as a placeholder.
    if (novelContent) {
      setScriptContent(novelContent);
      setScriptSource('asset');
      toast({ title: '已使用资产库中的内容' });
    } else {
      toast({ title: '暂无可用资产', description: '请先上传剧本文件', variant: 'destructive' });
    }
  }, [novelContent]);

  // ── Tab reachability ──
  const canGoToGenerate = !!extractedCore;
  const isExtracting = extractMutation.isPending || !!extractTaskId;

  return (
    <div className="py-8 px-4 max-w-2xl mx-auto space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">歌词生成</h1>
        <p className="text-muted-foreground mt-1">根据剧本内容提取歌曲内核，生成主题曲歌词</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start rounded-lg bg-muted p-1 h-10">
          {LYRICS_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              disabled={tab.value === 'generate' && !canGoToGenerate}
              className="rounded-md px-4 py-1.5 text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground transition-all flex items-center gap-1.5"
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.value === 'extract' && (
                <ChevronRight className="h-3 w-3 text-muted-foreground/40 ml-0.5" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ════════ TAB: 歌曲内核提取 ════════ */}
        <TabsContent value="extract" className="mt-6 space-y-6">
          <Card className="border-primary/30">
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-base">上传剧本</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  上传你的剧本文件，AI 将从中提取创作主题曲所需的核心要素。
                </p>
              </div>

              {/* Script upload area */}
              {!scriptContent ? (
                <div className="space-y-3">
                  <div
                    className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">点击上传剧本文件 (.txt)</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </div>
                  {novelContent && (
                    <Button variant="outline" className="w-full" onClick={handleUseAssetScript}>
                      <BookOpen className="h-4 w-4 mr-2" />
                      从资产库中选择
                    </Button>
                  )}
                </div>
              ) : (
                <Card className="bg-muted/50">
                  <CardContent className="pt-3 pb-3 flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {scriptSource === 'upload' ? '上传的剧本文件' : '来自资产库'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {scriptContent.length} 字符
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setScriptContent(''); setScriptSource(''); }}
                    >
                      更换
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Model + action */}
              <div className="flex items-center gap-2">
                <ModelSelector value={selectedModel} onChange={setSelectedModel} />
              </div>

              <Button
                className="w-full h-12 text-base"
                disabled={!scriptContent || isExtracting}
                onClick={() => extractMutation.mutate()}
              >
                {isExtracting ? (
                  <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> 提取中...</>
                ) : (
                  <><Sparkles className="h-5 w-5 mr-2" /> 提取歌曲内核</>
                )}
              </Button>

              {/* Inline progress */}
              {isExtracting && pollExtract && (
                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500 rounded-full"
                      style={{ width: `${pollExtract.status === 'SUCCESS' ? 100 : 50}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    {pollExtract.status === 'PENDING' ? '等待处理...' : '正在分析剧本...'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Extracted core result */}
          {extractedCore && (
            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-base">歌曲内核分析结果</h3>
                </div>
                <div className="rounded-md bg-muted/30 p-4">
                  <pre className="text-sm whitespace-pre-wrap leading-relaxed font-sans">
                    {extractedCore}
                  </pre>
                </div>
                <Button
                  className="w-full h-12 text-base"
                  onClick={() => setActiveTab('generate')}
                >
                  <ChevronRight className="h-5 w-5 mr-2" />
                  确认，下一步
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ════════ TAB: 歌词生成（占位） ════════ */}
        <TabsContent value="generate" className="mt-6 space-y-6">
          <Card>
            <CardContent className="pt-6 text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm">歌词生成功能将在下一步实现。</p>
              <p className="text-xs mt-1">已完成歌曲内核提取，可以基于以上分析结果生成歌词。</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

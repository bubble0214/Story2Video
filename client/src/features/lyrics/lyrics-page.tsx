'use client';

import { useState, useRef, useCallback, useEffect, Fragment } from 'react';
import { useMutation } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { draftsApi } from '@/services/drafts';
import type { DraftStepData } from '@/types/draft';
import type { WorkflowType } from '@/types/task';
import { useWorkflowStore } from '@/stores/workflow-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModelSelector } from '@/components/model-selector';
import { toast } from '@/hooks/use-toast';
import { Loader2, FileText, Upload, BookOpen, Sparkles, ChevronRight, AlertCircle, GitBranch, Music } from 'lucide-react';

const LYRICS_TABS = [
  { value: 'structure', label: '歌词结构规划', icon: GitBranch },
  { value: 'generate', label: '歌词生成', icon: FileText },
  { value: 'style', label: '生成歌曲', icon: Music },
];

interface Props {
  initialDraftId?: string | null;
}

export function LyricsPage({ initialDraftId }: Props) {
  const selectedNovelId = useWorkflowStore((s) => s.selectedNovelId);
  const novelContent = useWorkflowStore((s) => s.novelContent);
  const [activeTab, setActiveTab] = useState('structure');

  // Script source: upload or asset library
  const [scriptContent, setScriptContent] = useState('');
  const [scriptSource, setScriptSource] = useState<'upload' | 'asset' | ''>('');

  // Extracted core
  const [extractedCore, setExtractedCore] = useState('');
  const [extractTaskId, setExtractTaskId] = useState<string | null>(null);

  // Lyrics structure
  const [lyricsStructure, setLyricsStructure] = useState('');
  const [structureTaskId, setStructureTaskId] = useState<string | null>(null);

  // Generated lyrics
  const [generatedLyrics, setGeneratedLyrics] = useState('');
  const [generateTaskId, setGenerateTaskId] = useState<string | null>(null);

  // Style prompt for lyrics generation
  const [stylePrompt, setStylePrompt] = useState('');

  // Music style generation
  const [musicStyle, setMusicStyle] = useState('');
  const [musicStyleTaskId, setMusicStyleTaskId] = useState<string | null>(null);
  const [musicStyleFeedback, setMusicStyleFeedback] = useState('');
  const [musicStyleSchemes, setMusicStyleSchemes] = useState<Array<{
    name: string; prompt: string; explanation: string; structure: string; artists: string;
  }> | null>(null);
  const [selectedSchemeIndex, setSelectedSchemeIndex] = useState<number | null>(null);

  // Song generation
  const [songTaskId, setSongTaskId] = useState<string | null>(null);
  const [pollSong, setPollSong] = useState<{ status: string; result?: { song_audio_url?: string } } | null>(null);
  const [generatedSongUrl, setGeneratedSongUrl] = useState('');

  // Upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Model
  const [selectedModel, setSelectedModel] = useState('');

  // ── Draft persistence ──
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const draftCreatedRef = useRef(false);
  const draftIdRef = useRef<string | null>(null);
  const loadedRef = useRef(false);

  // Sync ref with state
  useEffect(() => { draftIdRef.current = draftId; }, [draftId]);

  // ── Draft restore (one-time on mount) ──
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    if (!initialDraftId) { setDraftLoaded(true); return; }
    (async () => {
      try {
        const { data: full } = await draftsApi.get(initialDraftId);
        setDraftId(full.id);
        draftCreatedRef.current = true;
        const sd = full.step_data as Record<string, any>;
        if (sd.scriptContent) setScriptContent(sd.scriptContent as string);
        if (sd.scriptSource) setScriptSource(sd.scriptSource as 'upload' | 'asset' | '');
        if (sd.extractedCore) setExtractedCore(sd.extractedCore as string);
        if (sd.lyricsStructure) setLyricsStructure(sd.lyricsStructure as string);
        if (sd.generatedLyrics) setGeneratedLyrics(sd.generatedLyrics as string);
        if (sd.stylePrompt) setStylePrompt(sd.stylePrompt as string);
        if (sd.musicStyle) setMusicStyle(sd.musicStyle as string);
        if (sd.musicStyleFeedback) setMusicStyleFeedback(sd.musicStyleFeedback as string);
        if (sd.genModel) setSelectedModel(sd.genModel as string);
        setActiveTab(sd.activeTab as string || 'structure');
        toast({ title: '已恢复之前的进度' });
      } catch {
        // ignore restore failure
      } finally {
        setDraftLoaded(true);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save draft immediately (upsert: one draft per user+workflow_type) ──
  const saveImmediate = useCallback(async () => {
    let id = draftIdRef.current;
    if (!id) {
      if (!draftCreatedRef.current) {
        draftCreatedRef.current = true;
        try {
          const stepData = {
            scriptContent,
            scriptSource,
            extractedCore,
            lyricsStructure,
            generatedLyrics,
            stylePrompt,
            musicStyle,
            musicStyleFeedback,
            genModel: selectedModel,
            activeTab,
          };
          const { data: draft } = await draftsApi.upsert({
            workflow_type: 'lyrics',
            title: '歌词草稿',
            current_step: activeTab,
            step_data: stepData as unknown as DraftStepData,
          });
          id = draft.id;
          setDraftId(id);
        } catch { return; }
      } else { return; }
    }
    if (!id) return;
    try {
      await draftsApi.update(id, {
        current_step: activeTab,
        title: '歌词草稿',
        status: 'in_progress',
        step_data: {
          scriptContent,
          scriptSource,
          extractedCore,
          lyricsStructure,
          generatedLyrics,
          stylePrompt,
          musicStyle,
          musicStyleFeedback,
          genModel: selectedModel,
          activeTab,
        } as unknown as DraftStepData,
      });
    } catch { /* silent */ }
  }, [activeTab, scriptContent, scriptSource, extractedCore, lyricsStructure, generatedLyrics, stylePrompt, musicStyle, musicStyleFeedback, selectedModel]);

  // Save on tab change
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    saveImmediate();
  };

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
          // Save draft after extraction completes
          setTimeout(saveImmediate, 0);
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

  // ── Plan lyrics structure ──
  const structureMutation = useMutation({
    mutationFn: async () => {
      const { data } = await tasksApi.create({
        workflow_type: 'plan_lyrics_structure' as WorkflowType,
        input_params: {
          script_content: scriptContent,
          core_analysis: extractedCore,
          model: selectedModel || undefined,
        },
      });
      return data as { id: string };
    },
    onSuccess: (data) => {
      setStructureTaskId(data.id);
      toast({ title: '开始规划歌词结构...' });
    },
    onError: (err: Error) => {
      toast({ title: '结构规划失败', description: err.message, variant: 'destructive' });
    },
  });

  // Poll structure result
  const [pollStructure, setPollStructure] = useState<{ status: string; result?: { lyrics_structure_content: string } } | null>(null);

  useEffect(() => {
    if (!structureTaskId) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await tasksApi.get(structureTaskId);
        setPollStructure(data as any);
        if (data.status === 'SUCCESS') {
          clearInterval(interval);
          setStructureTaskId(null);
          const content = (data as any).result?.lyrics_structure_content || '';
          setLyricsStructure(content);
          // Save draft after structure planning completes
          setTimeout(saveImmediate, 0);
          toast({ title: '歌词结构规划完成' });
        } else if (data.status === 'FAILED') {
          clearInterval(interval);
          setStructureTaskId(null);
          toast({ title: '结构规划失败', description: (data as any).error_message, variant: 'destructive' });
        }
      } catch {
        clearInterval(interval);
        setStructureTaskId(null);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [structureTaskId]);

  // ── Generate lyrics ──
  const generateMutation = useMutation({
    mutationFn: async (params: { style_prompt?: string } | undefined) => {
      const { data } = await tasksApi.create({
        workflow_type: 'generate_lyrics',
        input_params: {
          script_content: scriptContent,
          core_analysis: extractedCore,
          lyrics_structure: lyricsStructure,
          style_prompt: params?.style_prompt ?? stylePrompt,
          model: selectedModel || undefined,
        },
      });
      return data as { id: string };
    },
    onSuccess: (data) => {
      setGenerateTaskId(data.id);
      toast({ title: '开始生成歌词...' });
    },
    onError: (err: Error) => {
      toast({ title: '歌词生成失败', description: err.message, variant: 'destructive' });
    },
  });

  // Poll generate result
  const [pollGenerate, setPollGenerate] = useState<{ status: string; result?: { lyrics_content: string } } | null>(null);

  useEffect(() => {
    if (!generateTaskId) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await tasksApi.get(generateTaskId);
        setPollGenerate(data as any);
        if (data.status === 'SUCCESS') {
          clearInterval(interval);
          setGenerateTaskId(null);
          const content = (data as any).result?.lyrics_content || '';
          setGeneratedLyrics(content);
          // Save draft after lyrics generation completes
          setTimeout(saveImmediate, 0);
          toast({ title: '歌词生成完成' });
        } else if (data.status === 'FAILED') {
          clearInterval(interval);
          setGenerateTaskId(null);
          toast({ title: '歌词生成失败', description: (data as any).error_message, variant: 'destructive' });
        }
      } catch {
        clearInterval(interval);
        setGenerateTaskId(null);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [generateTaskId]);

  // ── Generate music style ──
  const musicStyleMutation = useMutation({
    mutationFn: async (params: { user_feedback?: string } | undefined) => {
      const { data } = await tasksApi.create({
        workflow_type: 'generate_music_style',
        input_params: {
          lyrics_content: generatedLyrics,
          core_analysis: extractedCore,
          user_feedback: params?.user_feedback ?? musicStyleFeedback,
          model: selectedModel || undefined,
        },
      });
      return data as { id: string };
    },
    onSuccess: (data) => {
      setMusicStyleTaskId(data.id);
      toast({ title: '开始生成风格方案...' });
    },
    onError: (err: Error) => {
      toast({ title: '风格方案生成失败', description: err.message, variant: 'destructive' });
    },
  });

  // Poll music style result
  const [pollMusicStyle, setPollMusicStyle] = useState<{ status: string; result?: { music_style_content: string; music_style_schemes?: Array<any> } } | null>(null);

  useEffect(() => {
    if (!musicStyleTaskId) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await tasksApi.get(musicStyleTaskId);
        setPollMusicStyle(data as any);
        if (data.status === 'SUCCESS') {
          clearInterval(interval);
          setMusicStyleTaskId(null);
          const content = (data as any).result?.music_style_content || '';
          setMusicStyle(content);
          const schemes = (data as any).result?.music_style_schemes;
          if (schemes) setMusicStyleSchemes(schemes);
          setTimeout(saveImmediate, 0);
          toast({ title: '风格方案生成完成' });
        } else if (data.status === 'FAILED') {
          clearInterval(interval);
          setMusicStyleTaskId(null);
          toast({ title: '风格方案生成失败', description: (data as any).error_message, variant: 'destructive' });
        }
      } catch {
        clearInterval(interval);
        setMusicStyleTaskId(null);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [musicStyleTaskId]);

  // ── Generate song ──
  const songMutation = useMutation({
    mutationFn: async (params: { prompt: string }) => {
      const lyrics = generatedLyrics;
      const { data } = await tasksApi.create({
        workflow_type: 'generate_song',
        input_params: {
          lyrics_content: lyrics,
          music_style_content: params.prompt,
          model: selectedModel || undefined,
        },
      });
      return data as { id: string };
    },
    onSuccess: (data) => {
      setSongTaskId(data.id);
      toast({ title: '开始生成歌曲...' });
    },
    onError: (err: Error) => {
      toast({ title: '歌曲生成失败', description: err.message, variant: 'destructive' });
    },
  });

  // Poll song result
  useEffect(() => {
    if (!songTaskId) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await tasksApi.get(songTaskId);
        setPollSong(data as any);
        if (data.status === 'SUCCESS') {
          clearInterval(interval);
          setSongTaskId(null);
          const url = (data as any).result?.song_audio_url || '';
          setGeneratedSongUrl(url);
          toast({ title: '歌曲生成完成' });
        } else if (data.status === 'FAILED') {
          clearInterval(interval);
          setSongTaskId(null);
          toast({ title: '歌曲生成失败', description: (data as any).error_message, variant: 'destructive' });
        }
      } catch {
        clearInterval(interval);
        setSongTaskId(null);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [songTaskId]);

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
    if (novelContent) {
      setScriptContent(novelContent);
      setScriptSource('asset');
      toast({ title: '已使用资产库中的内容' });
    } else {
      toast({ title: '暂无可用资产', description: '请先上传剧本文件', variant: 'destructive' });
    }
  }, [novelContent]);

  // ── Tab reachability ──
  const canGoToGenerate = !!lyricsStructure && !!scriptContent;
  const canGoToStyle = !!generatedLyrics && !!extractedCore;
  const isExtracting = extractMutation.isPending || !!extractTaskId;
  const isPlanning = structureMutation.isPending || !!structureTaskId;
  const isGenerating = generateMutation.isPending || !!generateTaskId;
  const isGeneratingStyle = musicStyleMutation.isPending || !!musicStyleTaskId;
  const isGeneratingSong = songMutation.isPending || !!songTaskId;

  // Auto-save when script content changes (after initial draft load)
  useEffect(() => {
    if (!draftLoaded) return;
    if (scriptContent) {
      const timer = setTimeout(saveImmediate, 500);
      return () => clearTimeout(timer);
    }
  }, [scriptContent, draftLoaded, saveImmediate]);

  return (
    <div className="py-8 px-4 max-w-2xl mx-auto space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">歌曲生成</h1>
        <p className="text-muted-foreground mt-1">从剧本提取歌曲核心元素，完成歌词创作与主题曲生成</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full justify-start rounded-lg bg-muted p-1.5 gap-0 h-12">
          {LYRICS_TABS.map((tab, i) => (
            <Fragment key={tab.value}>
              {i > 0 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
              )}
              <TabsTrigger
                value={tab.value}
                disabled={
                  (tab.value === 'generate' && !canGoToGenerate) ||
                  (tab.value === 'style' && !canGoToStyle)
                }
                className="rounded-md px-4 py-1.5 text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground transition-all flex items-center gap-1.5 flex-1 justify-center"
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </TabsTrigger>
            </Fragment>
          ))}
        </TabsList>

        {/* ════════ TAB: 歌词结构规划 (含歌曲内核提取) ════════ */}
        <TabsContent value="structure" className="mt-6 space-y-6">
          {/* ── Step 1: Upload script + Extract core ── */}
          <Card className="border-primary/30">
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-base">上传剧本，提取歌曲内核</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  上传你的剧本文件，AI 将从中提取创作主题曲所需的核心要素，并规划歌词结构。
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

              {/* Extract core button */}
              {!extractedCore && (
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
              )}

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

          {/* Extracted core result (editable) */}
          {extractedCore && (
            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-base">歌曲内核分析结果</h3>
                  </div>
                  <span className="text-xs text-muted-foreground">点击内容可编辑</span>
                </div>
                <textarea
                  className="w-full min-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring leading-relaxed"
                  value={extractedCore}
                  onChange={(e) => setExtractedCore(e.target.value)}
                  onBlur={() => setTimeout(saveImmediate, 0)}
                />
              </CardContent>
            </Card>
          )}

          {/* ── Step 2: Plan lyrics structure ── */}
          <Card className="border-primary/30">
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-base">规划歌词结构</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  基于歌曲内核分析结果，规划歌词的结构、段落安排和押韵方案。
                </p>
              </div>

              {/* Core summary */}
              {extractedCore && (
                <Card className="bg-muted/40">
                  <CardContent className="pt-3 pb-3">
                    <p className="text-xs text-muted-foreground mb-1">基于以上内核分析</p>
                  </CardContent>
                </Card>
              )}

              <Button
                className="w-full h-12 text-base"
                disabled={!extractedCore || isPlanning}
                onClick={() => structureMutation.mutate()}
              >
                {isPlanning ? (
                  <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> 规划中...</>
                ) : (
                  <><GitBranch className="h-5 w-5 mr-2" /> 开始规划歌词结构</>
                )}
              </Button>

              {/* Inline progress */}
              {isPlanning && pollStructure && (
                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500 rounded-full"
                      style={{ width: `${pollStructure.status === 'SUCCESS' ? 100 : 50}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    {pollStructure.status === 'PENDING' ? '等待处理...' : '正在规划歌词结构...'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Structure result (editable) */}
          {lyricsStructure && (
            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-base">歌词结构方案</h3>
                  </div>
                  <span className="text-xs text-muted-foreground">点击内容可编辑</span>
                </div>
                <textarea
                  className="w-full min-h-[300px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring leading-relaxed"
                  value={lyricsStructure}
                  onChange={(e) => setLyricsStructure(e.target.value)}
                  onBlur={() => setTimeout(saveImmediate, 0)}
                />
                <Button
                  className="w-full h-12 text-base"
                  onClick={() => handleTabChange('generate')}
                >
                  <ChevronRight className="h-5 w-5 mr-2" />
                  确认，下一步：生成歌词
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ════════ TAB: 歌词生成 ════════ */}
        <TabsContent value="generate" className="mt-6 space-y-6">
          <Card className="border-primary/30">
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-base">生成歌词</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  结合歌曲内核分析和歌词结构方案，生成完整的主题曲歌词。
                </p>
              </div>

              {/* Core summary (editable) */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">内核分析摘要（可编辑）</label>
                <textarea
                  className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring leading-relaxed"
                  value={extractedCore}
                  onChange={(e) => setExtractedCore(e.target.value)}
                  onBlur={() => setTimeout(saveImmediate, 0)}
                />
              </div>

              {/* Structure summary (editable) */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">歌词结构方案（可编辑）</label>
                <textarea
                  className="w-full min-h-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring leading-relaxed"
                  value={lyricsStructure}
                  onChange={(e) => setLyricsStructure(e.target.value)}
                  onBlur={() => setTimeout(saveImmediate, 0)}
                />
              </div>

              {/* Style prompt */}
              <div className="space-y-2">
                <label className="text-sm font-medium">风格要求（可选）</label>
                <textarea
                  className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder={
                    '示例：\n- 参考歌手：林志炫\n- 语感类似方文山，重意境和留白\n- 每行字数控制在8-12个字\n- 押韵，韵脚统一\n- 避免直白的网络用语'
                  }
                  value={stylePrompt}
                  onChange={(e) => setStylePrompt(e.target.value)}
                />
              </div>

              <Button
                className="w-full h-12 text-base"
                disabled={isGenerating}
                onClick={() => generateMutation.mutate(undefined)}
              >
                {isGenerating ? (
                  <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> 生成中...</>
                ) : (
                  <><FileText className="h-5 w-5 mr-2" /> 开始生成歌词</>
                )}
              </Button>

              {/* Inline progress */}
              {isGenerating && pollGenerate && (
                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500 rounded-full"
                      style={{ width: `${pollGenerate.status === 'SUCCESS' ? 100 : 50}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    {pollGenerate.status === 'PENDING' ? '等待处理...' : '正在生成歌词...'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Generated lyrics result */}
          {generatedLyrics && (
            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-base">生成的歌词</h3>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isGenerating}
                    onClick={() => generateMutation.mutate({ style_prompt: stylePrompt })}
                  >
                    <Loader2 className={`h-4 w-4 mr-1 ${isGenerating ? 'animate-spin' : ''}`} />
                    重新生成
                  </Button>
                </div>
                <div className="rounded-md bg-muted/30 p-4">
                  <pre className="text-sm whitespace-pre-wrap leading-relaxed font-sans">
                    {generatedLyrics}
                  </pre>
                </div>
                <Button
                  className="w-full h-12 text-base"
                  onClick={() => handleTabChange('style')}
                >
                  <ChevronRight className="h-5 w-5 mr-2" />
                  下一步：生成歌曲
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ════════ TAB: 谱曲风格 ════════ */}
        <TabsContent value="style" className="mt-6 space-y-6">
          <Card className="border-primary/30">
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-base">生成歌曲</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  基于歌词内容生成三种不同的谱曲风格方案，选择后一键生成歌曲。
                </p>
              </div>

              {/* Lyrics summary (read-only) */}
              {generatedLyrics && (
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">歌词内容（前 200 字预览）</label>
                  <div className="rounded-md bg-muted/30 p-3 max-h-32 overflow-y-auto">
                    <pre className="text-xs whitespace-pre-wrap leading-relaxed font-sans">
                      {generatedLyrics.slice(0, 200)}{generatedLyrics.length > 200 ? '...' : ''}
                    </pre>
                  </div>
                </div>
              )}

              {/* Story background summary (read-only) */}
              {extractedCore && (
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">故事背景（内核分析摘要）</label>
                  <div className="rounded-md bg-muted/30 p-3 max-h-32 overflow-y-auto">
                    <pre className="text-xs whitespace-pre-wrap leading-relaxed font-sans">
                      {extractedCore.slice(0, 300)}{extractedCore.length > 300 ? '...' : ''}
                    </pre>
                  </div>
                </div>
              )}

              <Button
                className="w-full h-12 text-base"
                disabled={isGeneratingStyle || !generatedLyrics}
                onClick={() => musicStyleMutation.mutate(undefined)}
              >
                {isGeneratingStyle ? (
                  <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> 生成中...</>
                ) : (
                  <><Music className="h-5 w-5 mr-2" /> 生成风格方案</>
                )}
              </Button>

              {/* Inline progress */}
              {isGeneratingStyle && pollMusicStyle && (
                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500 rounded-full"
                      style={{ width: `${pollMusicStyle.status === 'SUCCESS' ? 100 : 50}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    {pollMusicStyle.status === 'PENDING' ? '等待处理...' : '正在生成风格方案...'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Generated music style result */}
          {musicStyle && musicStyleSchemes && musicStyleSchemes.length > 0 && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Music className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-base">选择风格方案</h3>
                </div>
                <p className="text-sm text-muted-foreground">请点击选择一种方案，然后生成歌曲</p>

                {/* Scheme cards */}
                <div className="grid gap-4">
                  {musicStyleSchemes.map((scheme, idx) => (
                    <div
                      key={idx}
                      className={`relative rounded-lg border-2 p-4 cursor-pointer transition-all hover:shadow-md ${
                        selectedSchemeIndex === idx
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border bg-card hover:border-primary/50'
                      }`}
                      onClick={() => setSelectedSchemeIndex(idx)}
                    >
                      {selectedSchemeIndex === idx && (
                        <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                          <svg className="h-3.5 w-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                      <h4 className="font-semibold text-base mb-2 pr-8">{scheme.name}</h4>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-medium text-primary">Style Prompt：</span>
                          <span>{scheme.prompt}</span>
                        </div>
                        {scheme.explanation && (
                          <div>
                            <span className="font-medium text-muted-foreground">组合解释：</span>
                            <span className="text-muted-foreground">{scheme.explanation}</span>
                          </div>
                        )}
                        {scheme.structure && (
                          <div>
                            <span className="font-medium text-muted-foreground">结构建议：</span>
                            <span className="text-muted-foreground">{scheme.structure}</span>
                          </div>
                        )}
                        {scheme.artists && (
                          <div>
                            <span className="font-medium text-muted-foreground">参考艺术家：</span>
                            <span className="text-muted-foreground">{scheme.artists}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Song generation */}
                {selectedSchemeIndex !== null && (
                  <Button
                    className="w-full h-12 text-base"
                    disabled={isGeneratingSong}
                    onClick={() => {
                      setGeneratedSongUrl('');
                      songMutation.mutate({ prompt: musicStyleSchemes[selectedSchemeIndex].prompt });
                    }}
                  >
                    {isGeneratingSong ? (
                      <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> 歌曲生成中...</>
                    ) : (
                      <><Music className="h-5 w-5 mr-2" /> 生成歌曲</>
                    )}
                  </Button>
                )}

                {/* Song progress */}
                {isGeneratingSong && pollSong && (
                  <div className="space-y-1">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-500 rounded-full"
                        style={{ width: `${pollSong.status === 'SUCCESS' ? 100 : 50}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      {pollSong.status === 'PENDING' ? '等待处理...' : '正在生成歌曲...'}
                    </p>
                  </div>
                )}

                {/* Audio player */}
                {generatedSongUrl && (
                  <Card className="bg-muted/20">
                    <CardContent className="pt-4 pb-4">
                      <audio controls className="w-full" src={generatedSongUrl}>
                        您的浏览器不支持音频播放
                      </audio>
                    </CardContent>
                  </Card>
                )}

                {/* Feedback + regenerate */}
                <div className="space-y-2 pt-2 border-t">
                  <label className="text-sm font-medium">修改意见（可选）</label>
                  <textarea
                    className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="例如：方案1的Style Prompt太长了，希望更简洁一些；方案2加入更多电子元素..."
                    value={musicStyleFeedback}
                    onChange={(e) => setMusicStyleFeedback(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={isGeneratingStyle}
                    onClick={() => musicStyleMutation.mutate({ user_feedback: musicStyleFeedback })}
                  >
                    {isGeneratingStyle ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 重新生成中...</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-1" /> 根据意见重新生成</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Fallback: raw text display when schemes are unavailable (legacy drafts) */}
          {musicStyle && (!musicStyleSchemes || musicStyleSchemes.length === 0) && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Music className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-base">风格方案</h3>
                </div>
                <div className="rounded-md bg-muted/30 p-4">
                  <pre className="text-sm whitespace-pre-wrap leading-relaxed font-sans">
                    {musicStyle}
                  </pre>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

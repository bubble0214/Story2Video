'use client';

import { useState, useRef, useCallback, useEffect, Fragment } from 'react';
import { useMutation } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { draftsApi } from '@/services/drafts';
import type { DraftStepData } from '@/types/draft';
import { useWorkflowStore } from '@/stores/workflow-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModelSelector } from '@/components/model-selector';
import { toast } from '@/hooks/use-toast';
import { Loader2, FileText, Music, Image, Film, Sparkles, ChevronRight, Upload, BookOpen, X } from 'lucide-react';
import type { TaskResp } from '@/types/task';

const MV_TABS = [
  { value: 'storyboard', label: 'MV分镜', icon: Image },
  { value: 'generate', label: '生成MV', icon: Film },
];

interface Props {
  initialDraftId?: string | null;
}

export function MvPage({ initialDraftId }: Props) {
  const [activeTab, setActiveTab] = useState('source');

  // Selected assets
  const [selectedLyricsTask, setSelectedLyricsTask] = useState<TaskResp | null>(null);
  const [selectedSongTask, setSelectedSongTask] = useState<TaskResp | null>(null);
  const [selectedImageTasks, setSelectedImageTasks] = useState<TaskResp[]>([]);

  // Lyrics content cache
  const [lyricsContent, setLyricsContent] = useState('');

  // Storyboard segments
  const [segments, setSegments] = useState<Array<{
    lyrics: string;
    imagePrompt: string;
    imageUrl: string | null;
    duration: number;
  }>>([]);

  // Asset search
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [assetType, setAssetType] = useState<'lyrics' | 'song' | 'image'>('lyrics');
  const [assetList, setAssetList] = useState<TaskResp[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  // Storyboard AI generation
  const [storyboardContent, setStoryboardContent] = useState('');
  const [storyboardTaskId, setStoryboardTaskId] = useState<string | null>(null);
  const [musicStyle, setMusicStyle] = useState('');

  // MV generation
  const [mvTaskId, setMvTaskId] = useState<string | null>(null);
  const [pollMv, setPollMv] = useState<{ status: string; result?: { mv_video_url?: string; mv_audio_url?: string } } | null>(null);
  const [mvVideoUrl, setMvVideoUrl] = useState('');
  const [mvAudioUrl, setMvAudioUrl] = useState('');

  // Model
  const [selectedModel, setSelectedModel] = useState('');

  // Draft persistence
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const draftCreatedRef = useRef(false);
  const draftIdRef = useRef<string | null>(null);
  const loadedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const novelContent = useWorkflowStore((s) => s.novelContent);

  useEffect(() => { draftIdRef.current = draftId; }, [draftId]);

  // ── Draft restore ──
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
        if (sd.lyricsContent) setLyricsContent(sd.lyricsContent as string);
        if (sd.segments) setSegments(sd.segments as any[]);
        if (sd.mvVideoUrl) setMvVideoUrl(sd.mvVideoUrl as string);
        if (sd.mvAudioUrl) setMvAudioUrl(sd.mvAudioUrl as string);
        if (sd.genModel) setSelectedModel(sd.genModel as string);
        setActiveTab(sd.activeTab as string || 'source');
        toast({ title: '已恢复之前的进度' });
      } catch {
        // ignore restore failure
      } finally {
        setDraftLoaded(true);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save draft ──
  const saveImmediate = useCallback(async () => {
    let id = draftIdRef.current;
    if (!id) {
      if (!draftCreatedRef.current) {
        draftCreatedRef.current = true;
        try {
          const stepData = {
            lyricsContent,
            segments,
            mvVideoUrl,
            mvAudioUrl,
            genModel: selectedModel,
            activeTab,
          };
          const { data: draft } = await draftsApi.upsert({
            workflow_type: 'mv',
            title: 'MV生成草稿',
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
        title: 'MV生成草稿',
        status: 'in_progress',
        step_data: {
          lyricsContent,
          segments,
          mvVideoUrl,
          mvAudioUrl,
          genModel: selectedModel,
          activeTab,
        } as unknown as DraftStepData,
      });
    } catch { /* silent */ }
  }, [activeTab, lyricsContent, segments, mvVideoUrl, mvAudioUrl, selectedModel]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setTimeout(saveImmediate, 0);
  };

  // ── Fetch assets ──
  const fetchAssets = useCallback(async (type: 'lyrics' | 'song' | 'image') => {
    setAssetType(type);
    setLoadingAssets(true);
    setShowAssetModal(true);
    try {
      const typeFilter = type === 'image' ? 'generate_image' : type === 'song' ? 'generate_song' : 'generate_lyrics';
      const { data } = await tasksApi.list({ limit: 50, workflow_type: typeFilter });
      setAssetList((data as any).items?.filter((t: TaskResp) => t.status === 'SUCCESS') ?? []);
    } catch {
      toast({ title: '获取素材列表失败', variant: 'destructive' });
    } finally {
      setLoadingAssets(false);
    }
  }, []);

  const selectAsset = useCallback((task: TaskResp) => {
    if (assetType === 'lyrics') {
      setSelectedLyricsTask(task);
      setLyricsContent((task.result?.lyrics_content as string) || '');
    } else if (assetType === 'song') {
      setSelectedSongTask(task);
      setMvAudioUrl((task.result?.song_audio_url as string) || '');
    } else {
      setSelectedImageTasks((prev) => {
        if (prev.find((t) => t.id === task.id)) return prev;
        return [...prev, task];
      });
    }
    setShowAssetModal(false);
    toast({ title: '素材已选择' });
  }, [assetType]);

  const removeImageTask = useCallback((taskId: string) => {
    setSelectedImageTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  // ── File upload ──
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setLyricsContent(reader.result as string);
      toast({ title: '歌词已加载' });
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const handleUseAssetLyrics = useCallback(() => {
    fetchAssets('lyrics');
  }, [fetchAssets]);

  // ── Audio upload ──
  const handleAudioUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setMvAudioUrl(url);
    setSelectedSongTask(null);
    toast({ title: '音频已加载', description: file.name });
    e.target.value = '';
  }, []);

  // ── Segments management ──
  const parseLyricsToSegments = useCallback(() => {
    if (!lyricsContent) return;
    const lines = lyricsContent.split('\n').filter((l) => l.trim());
    const parsed = lines.map((line) => ({
      lyrics: line,
      imagePrompt: line,
      imageUrl: null,
      duration: 4,
    }));
    setSegments(parsed);
    toast({ title: `已解析 ${parsed.length} 段歌词` });
  }, [lyricsContent]);

  const updateSegment = useCallback((index: number, field: string, value: any) => {
    setSegments((prev) => {
      const next = [...prev];
      (next[index] as any)[field] = value;
      return next;
    });
  }, []);

  // ── Generate MV ──
  // Storyboard generation
  const storyboardMutation = useMutation({
    mutationFn: async () => {
      const { data } = await tasksApi.create({
        workflow_type: 'generate_mv_storyboard',
        input_params: {
          lyrics_content: lyricsContent,
          music_style: musicStyle,
          model: selectedModel || undefined,
        },
      });
      return data as { id: string };
    },
    onSuccess: (data) => {
      setStoryboardTaskId(data.id);
      toast({ title: 'AI 正在生成分镜脚本...' });
    },
    onError: (err: Error) => {
      toast({ title: '分镜生成失败', description: err.message, variant: 'destructive' });
    },
  });

  // Poll storyboard result
  const [pollStoryboard, setPollStoryboard] = useState<{ status: string; result?: { mv_storyboard: string } } | null>(null);

  useEffect(() => {
    if (!storyboardTaskId) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await tasksApi.get(storyboardTaskId);
        setPollStoryboard(data as any);
        if (data.status === 'SUCCESS') {
          clearInterval(interval);
          setStoryboardTaskId(null);
          const content = (data as any).result?.mv_storyboard || '';
          setStoryboardContent(content);
          // Also parse into segments
          const rows = content.split('\n').filter((l: string) => l.trim().startsWith('|') && l.includes('景别'));
          // First row after header is data
          const dataRows = content.split('\n').filter((l: string) => l.trim().startsWith('|') && !l.includes('---') && !l.includes('序号'));
          const parsed = dataRows.slice(1).map((row: string) => {
            const cols = row.split('|').map((c: string) => c.trim()).filter(Boolean);
            return {
              lyrics: cols[4] || '',
              imagePrompt: `[${cols[2] || '中景'}] ${cols[3] || ''}`,
              imageUrl: null,
              duration: 4,
            };
          });
          if (parsed.length > 0) setSegments(parsed);
          setTimeout(saveImmediate, 0);
          toast({ title: '分镜脚本生成完成' });
        } else if (data.status === 'FAILED') {
          clearInterval(interval);
          setStoryboardTaskId(null);
          toast({ title: '分镜生成失败', description: (data as any).error_message, variant: 'destructive' });
        }
      } catch {
        clearInterval(interval);
        setStoryboardTaskId(null);
      }
    }, 2000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyboardTaskId]);

  // ── Generate MV ──
  const mvMutation = useMutation({
    mutationFn: async () => {
      const { data } = await tasksApi.create({
        workflow_type: 'generate_mv',
        input_params: {
          lyrics_content: lyricsContent,
          song_audio_url: mvAudioUrl,
          segments: segments.map((s) => ({
            lyrics: s.lyrics,
            image_prompt: s.imagePrompt,
            image_url: s.imageUrl,
            duration: s.duration,
          })),
          model: selectedModel || undefined,
        },
      });
      return data as { id: string };
    },
    onSuccess: (data) => {
      setMvTaskId(data.id);
      toast({ title: '开始生成MV...' });
    },
    onError: (err: Error) => {
      toast({ title: 'MV生成失败', description: err.message, variant: 'destructive' });
    },
  });

  // Poll MV result
  useEffect(() => {
    if (!mvTaskId) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await tasksApi.get(mvTaskId);
        setPollMv(data as any);
        if (data.status === 'SUCCESS') {
          clearInterval(interval);
          setMvTaskId(null);
          const videoUrl = (data as any).result?.mv_video_url || '';
          const audioUrl = (data as any).result?.mv_audio_url || '';
          setMvVideoUrl(videoUrl);
          setMvAudioUrl(audioUrl || mvAudioUrl);
          setTimeout(saveImmediate, 0);
          toast({ title: 'MV生成完成' });
        } else if (data.status === 'FAILED') {
          clearInterval(interval);
          setMvTaskId(null);
          toast({ title: 'MV生成失败', description: (data as any).error_message, variant: 'destructive' });
        }
      } catch {
        clearInterval(interval);
        setMvTaskId(null);
      }
    }, 2000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mvTaskId]);

  const isGenerating = mvMutation.isPending || !!mvTaskId;
  const canGoToGenerate = segments.length > 0 && !!mvAudioUrl;

  return (
    <div className="py-8 px-4 max-w-4xl mx-auto space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">MV 生成</h1>
        <p className="text-muted-foreground mt-1">输入歌词、选择歌曲，AI 编排分镜并生成音乐视频</p>
      </div>

      {/* ── Input section (always visible) ── */}
      <Card className="border-primary/30">
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Lyrics input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">歌词内容</label>
              {!lyricsContent ? (
                <div className="space-y-2">
                  <div
                    className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground">上传歌词文件 (.txt)</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </div>
                  <Button variant="outline" className="w-full" onClick={handleUseAssetLyrics}>
                    <BookOpen className="h-4 w-4 mr-2" /> 从资产库选择
                  </Button>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">或直接输入</span>
                    </div>
                  </div>
                  <textarea
                    className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="在此粘贴歌词..."
                    value={lyricsContent}
                    onChange={(e) => setLyricsContent(e.target.value)}
                  />
                </div>
              ) : (
                <Card className="bg-muted/50">
                  <CardContent className="pt-3 pb-3 flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {lyricsContent.length > 50 ? lyricsContent.slice(0, 50) + '...' : '已输入歌词'}
                      </p>
                      <p className="text-xs text-muted-foreground">{lyricsContent.length} 字符</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setLyricsContent('')}>
                      更换
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Song audio selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">歌曲音频</label>
              {mvAudioUrl ? (
                <Card className="bg-muted/50">
                  <CardContent className="pt-3 pb-3 space-y-2">
                    <audio controls className="w-full h-8">
                      <source src={mvAudioUrl} type="audio/mpeg" />
                    </audio>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="flex-1" onClick={() => { setMvAudioUrl(''); setSelectedSongTask(null); }}>
                        更换
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  <div
                    className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => audioInputRef.current?.click()}
                  >
                    <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground">上传音频文件 (mp3/wav)</p>
                    <input
                      ref={audioInputRef}
                      type="file"
                      accept=".mp3,.wav,.m4a,.ogg"
                      className="hidden"
                      onChange={handleAudioUpload}
                    />
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => fetchAssets('song')}>
                    <Music className="h-4 w-4 mr-2" /> 从资产库选择
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full justify-start rounded-lg bg-muted p-1.5 gap-0 h-12">
          {MV_TABS.map((tab, i) => (
            <Fragment key={tab.value}>
              {i > 0 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
              )}
              <TabsTrigger
                value={tab.value}
                disabled={
                  (tab.value === 'generate' && !canGoToGenerate)
                }
                className="rounded-md px-4 py-1.5 text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground transition-all flex items-center gap-1.5 flex-1 justify-center"
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </TabsTrigger>
            </Fragment>
          ))}
        </TabsList>

        {/* ════════ TAB: MV分镜 ════════ */}
        <TabsContent value="storyboard" className="mt-6 space-y-6">
          <Card className="border-primary/30">
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-base">编辑 MV 分镜</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  AI 根据歌词生成专业分镜脚本，你可以在下方编辑和调整
                </p>
              </div>

              {/* AI Generate storyboard button */}
              {!storyboardContent && lyricsContent && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">音乐风格描述（可选）</label>
                    <textarea
                      className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="示例：电子摇滚，140bpm，迷幻氛围，重低音..."
                      value={musicStyle}
                      onChange={(e) => setMusicStyle(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <ModelSelector value={selectedModel} onChange={setSelectedModel} />
                  </div>
                  <Button
                    className="w-full h-12 text-base"
                    disabled={storyboardMutation.isPending || !!storyboardTaskId}
                    onClick={() => storyboardMutation.mutate()}
                  >
                    {storyboardMutation.isPending || !!storyboardTaskId ? (
                      <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> 生成中...</>
                    ) : (
                      <><Sparkles className="h-5 w-5 mr-2" /> AI 生成分镜脚本</>
                    )}
                  </Button>
                </div>
              )}

              {/* Inline progress */}
              {(storyboardMutation.isPending || !!storyboardTaskId) && pollStoryboard && (
                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500 rounded-full"
                      style={{ width: pollStoryboard.status === 'SUCCESS' ? 100 : pollStoryboard.status === 'RUNNING' ? 60 : 30 }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    {pollStoryboard.status === 'PENDING' ? '等待处理...' : '正在分析歌词生成分镜...'}
                  </p>
                </div>
              )}

              {/* Storyboard result as Markdown table */}
              {storyboardContent && (
                <Card className="bg-muted/30">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-sm">分镜脚本</h4>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setStoryboardContent(''); setSegments([]); }}
                        >
                          重新生成
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleTabChange('generate')}
                        >
                          确认并生成 MV <ChevronRight className="h-3 w-3 ml-1" />
                        </Button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-muted/50">
                            <th className="border px-2 py-1 text-left">序号</th>
                            <th className="border px-2 py-1 text-left">时间/节拍</th>
                            <th className="border px-2 py-1 text-left">景别与角度</th>
                            <th className="border px-2 py-1 text-left">画面内容</th>
                            <th className="border px-2 py-1 text-left">对应歌词/声音</th>
                            <th className="border px-2 py-1 text-left">备注</th>
                          </tr>
                        </thead>
                        <tbody>
                          {storyboardContent.split('\n').filter((l) => l.trim().startsWith('|') && !l.includes('---') && !l.includes('序号')).slice(1).map((row, i) => {
                            const cols = row.split('|').map((c) => c.trim()).filter(Boolean);
                            return (
                              <tr key={i} className="hover:bg-muted/30">
                                <td className="border px-2 py-1 align-top">{cols[0] || i + 1}</td>
                                <td className="border px-2 py-1 align-top">{cols[1] || ''}</td>
                                <td className="border px-2 py-1 align-top">{cols[2] || ''}</td>
                                <td className="border px-2 py-1 align-top max-w-[200px]">{cols[3] || ''}</td>
                                <td className="border px-2 py-1 align-top">{cols[4] || ''}</td>
                                <td className="border px-2 py-1 align-top">{cols[5] || ''}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground mb-1">已自动解析为 {segments.length} 个分镜段落，可在下方编辑画面提示词</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Segments list */}
              {segments.map((seg, i) => (
                <Card key={i} className="border-l-4 border-l-primary/40">
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground uppercase">
                        段落 {i + 1}
                      </span>
                    </div>
                    <div className="text-sm font-medium bg-muted/30 rounded px-3 py-2">
                      {seg.lyrics}
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">画面提示词</label>
                      <textarea
                        className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={seg.imagePrompt}
                        onChange={(e) => updateSegment(i, 'imagePrompt', e.target.value)}
                        placeholder="描述此段歌词对应的画面..."
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">时长（秒）</label>
                      <input
                        type="number"
                        className="w-16 rounded-md border border-input bg-background px-2 py-1 text-sm"
                        value={seg.duration}
                        min={2}
                        max={30}
                        onChange={(e) => updateSegment(i, 'duration', parseInt(e.target.value) || 4)}
                      />
                    </div>
                    {seg.imageUrl && (
                      <div className="mt-2">
                        <img src={seg.imageUrl} alt="" className="h-24 rounded-md object-cover" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              {segments.length > 0 && (
                <Button
                  className="w-full h-12 text-base"
                  onClick={() => handleTabChange('generate')}
                >
                  <ChevronRight className="h-5 w-5 mr-2" />
                  确认分镜，下一步：生成 MV
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ TAB: 生成 MV ════════ */}
        <TabsContent value="generate" className="mt-6 space-y-6">
          <Card className="border-primary/30">
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-base">生成音乐视频</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  确认以下素材后，开始生成 MV
                </p>
              </div>

              {/* Summary cards */}
              <Card className="bg-muted/40">
                <CardContent className="pt-3 pb-3 flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">歌词</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {lyricsContent.slice(0, 100)}...
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-muted/40">
                <CardContent className="pt-3 pb-3 flex items-center gap-3">
                  <Music className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {mvAudioUrl ? '背景音乐' : '未选择音频'}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-muted/40">
                <CardContent className="pt-3 pb-3 flex items-center gap-3">
                  <Image className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{segments.length} 个分镜段落</p>
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center gap-2">
                <ModelSelector value={selectedModel} onChange={setSelectedModel} />
              </div>

              <Button
                className="w-full h-12 text-base"
                disabled={isGenerating || !mvAudioUrl}
                onClick={() => mvMutation.mutate()}
              >
                {isGenerating ? (
                  <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> 生成中...</>
                ) : (
                  <><Film className="h-5 w-5 mr-2" /> 开始生成 MV</>
                )}
              </Button>

              {/* Inline progress */}
              {isGenerating && pollMv && (
                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500 rounded-full"
                      style={{ width: `${pollMv.status === 'SUCCESS' ? 100 : pollMv.status === 'RUNNING' ? 60 : 30}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    {pollMv.status === 'PENDING' ? '等待处理...' : '正在生成 MV...'}
                  </p>
                </div>
              )}

              {/* Result player */}
              {(mvVideoUrl || mvAudioUrl) && !isGenerating && (
                <Card className="border-green-500/30">
                  <CardContent className="pt-6 space-y-4">
                    <h3 className="font-semibold text-base text-green-600">MV 生成完成</h3>
                    {mvVideoUrl ? (
                      <video controls className="w-full rounded-lg">
                        <source src={mvVideoUrl} type="video/mp4" />
                      </video>
                    ) : (
                      <audio controls className="w-full">
                        <source src={mvAudioUrl} type="audio/mpeg" />
                      </audio>
                    )}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Asset selection modal ── */}
      {showAssetModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowAssetModal(false)}>
          <div className="bg-background rounded-lg p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">
                选择{assetType === 'lyrics' ? '歌词' : assetType === 'song' ? '歌曲' : '图片'}素材
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowAssetModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {loadingAssets ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : assetList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">暂无已完成的任务</p>
            ) : (
              <div className="space-y-2">
                {assetList.map((task) => (
                  <Card
                    key={task.id}
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => selectAsset(task)}
                  >
                    <CardContent className="pt-3 pb-3 flex items-center gap-3">
                      {assetType === 'image' && (task.result?.result_url as string) ? (
                        <img
                          src={task.result?.result_url as string}
                          alt=""
                          className="h-12 w-12 rounded object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
                          {assetType === 'lyrics' ? <FileText className="h-5 w-5" /> : <Music className="h-5 w-5" />}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {task.workflow_type.replace('generate_', '')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(task.created_at).toLocaleDateString('zh-CN')}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

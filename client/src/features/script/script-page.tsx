'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useWorkflowStore } from '@/stores/workflow-store';
import { tasksApi } from '@/services/tasks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ModelSelector } from '@/components/model-selector';
import { toast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Loader2, Sparkles, FileText, CheckCircle2, ChevronRight, BookOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { TaskResp } from '@/types/task';
import { draftsApi } from '@/services/drafts';
import type { DraftStepData } from '@/types/draft';

const GENRE_OPTIONS = ['科幻', '古装', '悬疑', '爱情', '奇幻', '战争', '文艺', '喜剧', '恐怖'];
const FORMAT_OPTIONS = ['电影', '剧集'];
const TONE_OPTIONS = ['紧张', '温暖', '冷峻', '幽默', '悲壮', '轻快', '深沉'];

const SCRIPT_TABS = [
  { value: 'role_settings', label: '角色设定', icon: Sparkles },
  { value: 'novel_source', label: '小说来源', icon: FileText },
  { value: 'novel_analysis', label: '核心要素提取', icon: BookOpen },
  { value: 'generate', label: '剧本生成', icon: CheckCircle2 },
];
const TAB_ORDER = ['role_settings', 'novel_source', 'novel_analysis', 'generate'];

function buildCharacterPrompt(genre: string, format: string, tone: string): string {
  const parts: string[] = [];
  parts.push('你现在是一位资深影视编剧，擅长将文学作品转化为视觉性极强的电影剧本。');
  parts.push('接下来，我将分阶段提供一部小说，请你协助我完成剧本改编。');
  parts.push(`我们的目标是创作一部${genre || '（待定）'}风格的${format || '（待定）'}，整体基调${tone || '（待定）'}。`);
  parts.push('在每次回复前，请先以编剧思维分析我的需求，再给出内容。');
  return parts.join('\n');
}

const ANALYSIS_SYSTEM_PROMPT =
  '请仔细阅读以上小说章节。作为编剧，请你完成以下分析：\n\n' +
  '1. 用一段话概括核心故事（一句话梗概Logline）。\n\n' +
  '2. 列出主要人物小传（每人一句话，标明其戏剧性欲望和致命缺陷）。\n\n' +
  '3. 标出3-5个最震撼、必须保留的\'名场面\'。\n\n' +
  '4. 指出原著中可能不适合影视化呈现的部分（如大量内心独白），并给出改编建议。';

export function ScriptPage({ initialDraftId }: { initialDraftId?: string }) {
  const router = useRouter();

  // ── Store ──
  const characterSettings = useWorkflowStore((s) => s.characterSettings);
  const setCharacterSettings = useWorkflowStore((s) => s.setCharacterSettings);
  const novelContent = useWorkflowStore((s) => s.novelContent);
  const setNovelContent = useWorkflowStore((s) => s.setNovelContent);

  // ── Local state ──
  const [activeTab, setActiveTab] = useState('role_settings');
  const [genModel, setGenModel] = useState('');
  const [extraPrompt, setExtraPrompt] = useState('');
  const [novelAnalysis, setNovelAnalysis] = useState<string | null>(null);
  const [analysisTaskId, setAnalysisTaskId] = useState<string | null>(null);
  const [scriptTaskId, setScriptTaskId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [assetPopoverOpen, setAssetPopoverOpen] = useState(false);

  // ── Draft persistence ──
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const draftCreatedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftIdRef = useRef<string | null>(null);

  // Sync ref with state
  useEffect(() => { draftIdRef.current = draftId; }, [draftId]);

  // ── Derived reachability ──
  const hasRoleSettings = characterSettings.genre && characterSettings.format && characterSettings.tone;
  const hasNovelSource = novelContent.trim().length > 0;
  const hasAnalysis = novelAnalysis !== null;

  const isReachable = (tab: string) => {
    if (tab === 'role_settings') return true;
    if (tab === 'novel_source') return hasRoleSettings;
    if (tab === 'novel_analysis') return hasRoleSettings && hasNovelSource;
    if (tab === 'generate') return hasRoleSettings && hasNovelSource && hasAnalysis;
    return false;
  };

  // ── Draft restore (one-time on mount) ──
  const loadedRef = useRef(false);
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
        if (sd.genre || sd.format || sd.tone) {
          setCharacterSettings({
            genre: (sd.genre as string) || '',
            format: (sd.format as string) || '',
            tone: (sd.tone as string) || '',
          });
        }
        if (sd.novelContent) setNovelContent(sd.novelContent as string);
        if (sd.novelAnalysis) setNovelAnalysis(sd.novelAnalysis as string);
        if (sd.extraPrompt) setExtraPrompt(sd.extraPrompt as string);
        if (sd.genModel) setGenModel(sd.genModel as string);
        setActiveTab(sd.activeTab as string || 'role_settings');
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
            genre: characterSettings.genre,
            format: characterSettings.format,
            tone: characterSettings.tone,
            novelContent,
            novelAnalysis,
            extraPrompt,
            genModel,
            activeTab,
          };
          const { data: draft } = await draftsApi.upsert({
            workflow_type: 'script',
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
        status: 'in_progress',
        step_data: {
          genre: characterSettings.genre,
          format: characterSettings.format,
          tone: characterSettings.tone,
          novelContent,
          novelAnalysis,
          extraPrompt,
          genModel,
          activeTab,
        } as unknown as DraftStepData,
      });
    } catch { /* silent */ }
  }, [activeTab, characterSettings, novelContent, novelAnalysis, extraPrompt, genModel]);

  // Save on tab change
  const handleTabChange = (tab: string) => {
    if (isReachable(tab)) {
      setActiveTab(tab);
      saveImmediate();
    }
  };

  // Auto-save when role settings are completed or novel content changes
  useEffect(() => {
    if (!draftLoaded) return;
    if (hasRoleSettings || novelContent) {
      const timer = setTimeout(saveImmediate, 500);
      return () => clearTimeout(timer);
    }
  }, [hasRoleSettings, novelContent, draftLoaded, saveImmediate]);

  // ── Novel source: file upload ──
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!file.name.endsWith('.txt')) {
      toast({ title: '仅支持 .txt 文件', variant: 'destructive' });
      return;
    }
    setIsUploading(true);
    try {
      // Read as ArrayBuffer then decode with GBK fallback for Chinese Windows users
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);

      // Try UTF-8 first, fall back to GBK if it contains invalid UTF-8 sequences
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        // Fall back to GBK encoding (common on Chinese Windows)
        text = new TextDecoder('gbk').decode(bytes);
      }
      if (!text.trim()) {
        toast({ title: '文件内容为空', variant: 'destructive' });
        return;
      }
      setNovelContent(text);
      toast({ title: '小说上传成功', description: `已加载 ${file.name}（${(text.length / 1024).toFixed(1)} KB）` });
      setTimeout(saveImmediate, 100);
    } catch (err) {
      toast({ title: '文件读取失败', description: String(err), variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  }, [setNovelContent]);

  // ── Novel source: select from assets ──
  const { data: assetNovelsData } = useQuery({
    queryKey: ['asset-novels'],
    queryFn: async () => {
      const resp = await tasksApi.list({ workflow_type: undefined, limit: 50 });
      return resp.data;
    },
    enabled: assetPopoverOpen,
  });
  const assetNovels: TaskResp[] = (assetNovelsData?.items ?? [])
    .filter((t: TaskResp) => t.status === 'SUCCESS' && t.result?.novel_content);

  const handleSelectAssetNovel = useCallback((task: TaskResp) => {
    const content = task.result?.novel_content as string;
    if (content) {
      setNovelContent(content);
      setNovelAnalysis(null);
      toast({ title: '已加载小说', description: (task.result?.title as string) ?? task.id.slice(0, 8) });
    }
    setAssetPopoverOpen(false);
  }, [setNovelContent]);

  // ── Analysis polling ──
  const { data: polledAnalysis } = useQuery({
    queryKey: ['task', analysisTaskId],
    queryFn: async () => {
      const { data } = await tasksApi.get(analysisTaskId!);
      return data;
    },
    enabled: !!analysisTaskId,
    refetchInterval: (query) => {
      const state = query.state.data;
      if (!state) return 1000;
      if (state.status === 'SUCCESS' || state.status === 'FAILED') return false;
      return 1000;
    },
  });

  useEffect(() => {
    if (!polledAnalysis) return;
    if (polledAnalysis.status === 'SUCCESS') {
      const result = polledAnalysis.result;
      if (result.novel_analysis) {
        setNovelAnalysis(result.novel_analysis as string);
        setAnalysisTaskId(null);
        toast({ title: '核心要素提取完成' });
      }
    } else if (polledAnalysis.status === 'FAILED') {
      setAnalysisTaskId(null);
      toast({ title: '分析失败', description: polledAnalysis.error_message || '未知错误', variant: 'destructive' });
    }
  }, [polledAnalysis]);

  // ── Script generation polling ──
  const { data: polledScript } = useQuery({
    queryKey: ['task', scriptTaskId],
    queryFn: async () => {
      const { data } = await tasksApi.get(scriptTaskId!);
      return data;
    },
    enabled: !!scriptTaskId,
    refetchInterval: (query) => {
      const state = query.state.data;
      if (!state) return 1000;
      if (state.status === 'SUCCESS' || state.status === 'FAILED') return false;
      return 1000;
    },
  });

  useEffect(() => {
    if (!polledScript) return;
    if (polledScript.status === 'SUCCESS') {
      const result = polledScript.result;
      if (result.script_content) {
        setScriptTaskId(null);
        toast({ title: '剧本生成完成' });
        router.push(`/result/${scriptTaskId}`);
      }
    } else if (polledScript.status === 'FAILED') {
      setScriptTaskId(null);
      toast({ title: '剧本生成失败', description: polledScript.error_message || '未知错误', variant: 'destructive' });
    }
  }, [polledScript, scriptTaskId, router]);

  // ── Analysis mutation ──
  const analyzeMutation = useMutation({
    mutationFn: () => {
      const characterPrompt = buildCharacterPrompt(
        characterSettings.genre,
        characterSettings.format,
        characterSettings.tone,
      );
      return tasksApi.create({
        workflow_type: 'generate_analyze_novel',
        input_params: {
          novel_content: novelContent,
          character_setting_prompt: characterPrompt,
          ...(genModel ? { model: genModel } : {}),
        },
      });
    },
    onSuccess: ({ data }) => {
      setAnalysisTaskId(data.id);
    },
    onError: () => {
      toast({ title: '创建分析任务失败', variant: 'destructive' });
    },
  });

  // ── Script generation mutation ──
  const generateMutation = useMutation({
    mutationFn: () => {
      const characterPrompt = buildCharacterPrompt(
        characterSettings.genre,
        characterSettings.format,
        characterSettings.tone,
      );
      return tasksApi.create({
        workflow_type: 'generate_script',
        input_params: {
          novel_content: novelContent,
          novel_analysis: novelAnalysis || '',
          character_setting_prompt: characterPrompt,
          ...(extraPrompt.trim() ? { prompt: extraPrompt.trim() } : {}),
          ...(genModel ? { model: genModel } : {}),
        },
      });
    },
    onSuccess: ({ data }) => {
      setScriptTaskId(data.id);
    },
    onError: () => {
      toast({ title: '创建任务失败', variant: 'destructive' });
    },
  });

  const isAnalyzing = analyzeMutation.isPending || !!analysisTaskId;
  const isGenerating = generateMutation.isPending || !!scriptTaskId;

  return (
    <div className="py-8 px-4 max-w-2xl mx-auto space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">剧本生成</h1>
        <p className="text-muted-foreground mt-1">设定编剧角色、分析小说核心要素，一键生成剧本</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full justify-start rounded-lg bg-muted p-1 h-10">
          {SCRIPT_TABS.map((tab, i) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              disabled={!isReachable(tab.value)}
              className="rounded-md px-4 py-1.5 text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground transition-all flex items-center gap-1.5"
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              {i < TAB_ORDER.length - 1 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground/40 ml-0.5" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ════════ TAB 1: 角色设定 ════════ */}
        <TabsContent value="role_settings" className="mt-6 space-y-6">
          <Card className="border-primary/30">
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-base">LLM 角色设定</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  为 AI 设定编剧角色，激活其专业编剧能力。配置以下选项后，AI 会以资深影视编剧的身份处理你的小说。
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">类型</label>
                  <Select
                    value={characterSettings.genre}
                    onValueChange={(v) => setCharacterSettings({ ...characterSettings, genre: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择类型" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENRE_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">格式</label>
                  <Select
                    value={characterSettings.format}
                    onValueChange={(v) => setCharacterSettings({ ...characterSettings, format: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择格式" />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMAT_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">基调</label>
                  <Select
                    value={characterSettings.tone}
                    onValueChange={(v) => setCharacterSettings({ ...characterSettings, tone: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择基调" />
                    </SelectTrigger>
                    <SelectContent>
                      {TONE_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                className="w-full h-12 text-base"
                onClick={() => handleTabChange('novel_source')}
                disabled={!hasRoleSettings}
              >
                <ChevronRight className="h-5 w-5 mr-2" />
                确认，下一步
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ TAB 2: 小说来源 ════════ */}
        <TabsContent value="novel_source" className="mt-6 space-y-6">
          <Card className="border-primary/30">
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-base">小说来源</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  上传 .txt 小说文件，或从已生成的小说资产中选择。上传后 AI 将消化并提炼改编所需的核心元素。
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> 上传中...</>
                  ) : (
                    <><FileText className="h-4 w-4 mr-2" /> 上传 .txt 文件</>
                  )}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <div className="relative">
                  <Button
                    variant="outline"
                    onClick={() => setAssetPopoverOpen((v) => !v)}
                  >
                    <FileText className="h-4 w-4 mr-2" /> 从资产选择
                  </Button>
                  {assetPopoverOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setAssetPopoverOpen(false)} />
                      <div className="absolute left-0 top-full mt-1 z-50 w-56 rounded-md border bg-popover p-1 shadow-md text-sm">
                        <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                          已生成的小说
                        </div>
                        {assetNovels.length === 0 && (
                          <div className="px-2 py-2 text-xs text-muted-foreground">暂无</div>
                        )}
                        {assetNovels.slice(0, 5).map((task) => (
                          <button
                            key={task.id}
                            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent hover:text-accent-foreground text-left"
                            onClick={() => handleSelectAssetNovel(task)}
                          >
                            <span className="text-xs text-muted-foreground shrink-0">📖</span>
                            <span className="truncate text-xs">
                              {(task.result?.title as string) || task.id.slice(0, 8)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Novel content editor */}
              {hasNovelSource && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">小说内容（可编辑）</label>
                  <textarea
                    className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-sans leading-relaxed"
                    value={novelContent}
                    onChange={(e) => setNovelContent(e.target.value)}
                    rows={8}
                  />
                </div>
              )}

              {!hasNovelSource && (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm">请上传小说文件或从资产中选择</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => handleTabChange('role_settings')}>
                  返回角色设定
                </Button>
                <Button
                  className="flex-1 h-12 text-base"
                  onClick={() => handleTabChange('novel_analysis')}
                  disabled={!hasNovelSource}
                >
                  <ChevronRight className="h-5 w-5 mr-2" />
                  确认，下一步
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ TAB 3: 核心要素提取 ════════ */}
        <TabsContent value="novel_analysis" className="mt-6 space-y-6">
          <Card className="border-primary/30">
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-base">AI 核心要素提取</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  AI 将作为编剧消化小说内容，提炼改编所需的核心元素，包括故事梗概、人物小传、名场面和改编建议。
                </p>
              </div>

              {/* Character settings summary */}
              <Card className="bg-muted/50">
                <CardContent className="pt-3 pb-3">
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>类型: <strong>{characterSettings.genre}</strong></span>
                    <span>格式: <strong>{characterSettings.format}</strong></span>
                    <span>基调: <strong>{characterSettings.tone}</strong></span>
                    <span>小说: <strong>{(novelContent.length / 1024).toFixed(1)} KB</strong></span>
                  </div>
                </CardContent>
              </Card>

              {/* Analysis prompt preview */}
              <Card className="bg-muted/30 border-dashed">
                <CardContent className="pt-3 pb-3">
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {ANALYSIS_SYSTEM_PROMPT}
                  </p>
                </CardContent>
              </Card>

              {/* Analysis result */}
              {hasAnalysis && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">分析结果</label>
                  <Card>
                    <CardContent className="pt-4 pb-4">
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{novelAnalysis}</p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col gap-3">
                <Button
                  className="w-full h-12 text-base"
                  onClick={() => analyzeMutation.mutate()}
                  disabled={isAnalyzing || hasAnalysis}
                >
                  {isAnalyzing ? (
                    <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> 分析中...</>
                  ) : hasAnalysis ? (
                    <><CheckCircle2 className="h-5 w-5 mr-2" /> 分析完成</>
                  ) : (
                    <><BookOpen className="h-5 w-5 mr-2" /> 开始分析</>
                  )}
                </Button>

                {isAnalyzing && polledAnalysis && polledAnalysis.status !== 'SUCCESS' && polledAnalysis.status !== 'FAILED' && (
                  <div className="space-y-1">
                    <Progress value={(polledAnalysis as any).progress} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{(polledAnalysis as any).current_step || '处理中...'}</span>
                      <span>{Math.round((polledAnalysis as any).progress)}%</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => handleTabChange('novel_source')}>
                  返回小说来源
                </Button>
                <Button
                  className="flex-1 h-12 text-base"
                  onClick={() => handleTabChange('generate')}
                  disabled={!hasAnalysis}
                >
                  <ChevronRight className="h-5 w-5 mr-2" />
                  确认，下一步
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ TAB 4: 剧本生成 ════════ */}
        <TabsContent value="generate" className="mt-6 space-y-6">
          <Card className="border-primary/30">
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-base">生成剧本</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  基于角色设定、小说分析结果，可选输入额外指令后一键生成剧本。
                </p>
              </div>

              {/* Character settings summary */}
              <Card className="bg-muted/50">
                <CardContent className="pt-3 pb-3">
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>类型: <strong>{characterSettings.genre}</strong></span>
                    <span>格式: <strong>{characterSettings.format}</strong></span>
                    <span>基调: <strong>{characterSettings.tone}</strong></span>
                    <span>小说: <strong>{(novelContent.length / 1024).toFixed(1)} KB</strong></span>
                  </div>
                </CardContent>
              </Card>

              {/* Analysis summary */}
              {hasAnalysis && (
                <details className="rounded-md border border-muted-foreground/20 bg-muted/30">
                  <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground select-none">
                    核心要素分析（点击展开）
                  </summary>
                  <pre className="max-h-60 overflow-y-auto px-4 pb-3 text-sm text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
                    {novelAnalysis}
                  </pre>
                </details>
              )}

              <textarea
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
                placeholder="可选：额外的编剧指令、格式要求、角色偏好..."
                value={extraPrompt}
                onChange={(e) => setExtraPrompt(e.target.value)}
                rows={3}
              />

              <div className="flex items-center justify-between">
                <ModelSelector value={genModel} onChange={setGenModel} />
              </div>

              <Button
                className="w-full h-12 text-base"
                onClick={() => generateMutation.mutate()}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> 生成中...</>
                ) : (
                  <><Sparkles className="h-5 w-5 mr-2" /> 生成剧本</>
                )}
              </Button>

              {isGenerating && polledScript && polledScript.status !== 'SUCCESS' && polledScript.status !== 'FAILED' && (
                <div className="space-y-1">
                  <Progress value={(polledScript as any).progress} />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{(polledScript as any).current_step || '处理中...'}</span>
                    <span>{Math.round((polledScript as any).progress)}%</span>
                  </div>
                </div>
              )}

              {generateMutation.isError && (
                <Card className="border-destructive">
                  <CardContent className="pt-4 pb-4">
                    <p className="text-sm text-destructive mb-2">启动任务失败，请重试。</p>
                    <Button variant="outline" size="sm" onClick={() => generateMutation.mutate()}>
                      重试
                    </Button>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => handleTabChange('novel_analysis')}>
                  返回分析
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

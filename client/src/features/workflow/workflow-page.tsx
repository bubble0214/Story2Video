'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useMutation, useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { draftsApi } from '@/services/drafts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { ModelSelector } from '@/components/model-selector';
import { PromptOptimizer } from '@/components/prompt-optimizer';
import type { WorkflowType, TaskResp } from '@/types/task';

interface WorkflowPageProps {
  workflowType: WorkflowType;
  title: string;
  description: string;
  promptPlaceholder?: string;
  defaultPrompt?: string;
  initialDraftId?: string;
}

const SCRIPT_TAB_PROMPTS: Record<string, string> = {
  novel_tweet: '你是一个专业的小说推文作者，请你优化这段小说，用作小说推文，要有爆款开头，结尾要留钩子，不利于观众停留的剧情可以酌情删减掉。',
  video_tweet: '你是一个专业的视频推文博主，请你优化这段小说推文，用作视频推文，要有爆款开头，结尾要留钩子，不适合做成视频的内容适当进行改编。',
  storyboard: '你是一个编剧兼导演，擅长把小说文案改编成适用于{{视频模型名称}}视频模型直接生成视频的分镜脚本，要求10秒为一段，最少{{多少}}个分镜，每一段固定统一的风格和统一的色调。分镜参考模板:景别，运镜，主角，动作，台词，音效，光影，场景。我需要做成{{视频类型}}视频。',
};

// Map script tabs to individual workflow types
const TAB_WORKFLOW_TYPE: Record<string, WorkflowType> = {
  novel_tweet: 'generate_novel_tweet',
  video_tweet: 'generate_video_tweet',
  storyboard: 'generate_storyboard',
};

// Order of tabs for auto-advancement
const TAB_ORDER = ['novel_tweet', 'video_tweet', 'storyboard'];

const SCRIPT_TABS = [
  { value: 'novel_tweet', label: '小说推文' },
  { value: 'video_tweet', label: '视频推文' },
  { value: 'storyboard', label: '分镜脚本' },
];

export function WorkflowPage({
  workflowType,
  title,
  description,
  promptPlaceholder = '在此输入你的内容或想法...',
  defaultPrompt = '',
  initialDraftId,
}: WorkflowPageProps) {
  const keywords = useWorkflowStore((s) => s.keywords);
  const selectedNovelId = useWorkflowStore((s) => s.selectedNovelId);
  const currentTaskId = useWorkflowStore((s) => s.currentTaskId);
  const novelContent = useWorkflowStore((s) => s.novelContent);
  const novelTweetContent = useWorkflowStore((s) => s.novelTweetContent);
  const videoTweetContent = useWorkflowStore((s) => s.videoTweetContent);
  const setCurrentTaskId = useWorkflowStore((s) => s.setCurrentTaskId);
  const setNovelContent = useWorkflowStore((s) => s.setNovelContent);
  const setNovelTweetContent = useWorkflowStore((s) => s.setNovelTweetContent);
  const setVideoTweetContent = useWorkflowStore((s) => s.setVideoTweetContent);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [selectedModel, setSelectedModel] = useState('');
  const [storyVars, setStoryVars] = useState<Record<string, string>>({
    video_model: '',
    video_type: '',
    count: '',
  });
  const [defaultConfirmed, setDefaultConfirmed] = useState(false);

  // ── Draft persistence ──
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const draftCreatedRef = useRef(false);

  // ── Novel file upload (script mode only) ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-selected
    e.target.value = '';
    if (!file.name.endsWith('.txt')) {
      toast({ title: '仅支持 .txt 文件', variant: 'destructive' });
      return;
    }
    setIsUploading(true);
    try {
      const text = await file.text();
      if (!text.trim()) {
        toast({ title: '文件内容为空', variant: 'destructive' });
        return;
      }
      setNovelContent(text);
      setNovelTweetContent('');
      setVideoTweetContent('');
      toast({ title: '小说上传成功', description: `已加载 ${file.name}（${(text.length / 1024).toFixed(1)} KB）` });
    } catch (err) {
      toast({ title: '文件读取失败', description: String(err), variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  }, [setNovelContent, setNovelTweetContent, setVideoTweetContent]);

  const isScriptMode = workflowType === 'generate_script';

  // ── Select novel from assets ──
  const [assetPopoverOpen, setAssetPopoverOpen] = useState(false);
  const { data: assetNovelsData } = useQuery({
    queryKey: ['asset-novels'],
    queryFn: async () => {
      const resp = await tasksApi.list({ workflow_type: undefined, limit: 50 });
      return resp.data;
    },
    enabled: workflowType === 'generate_script' && assetPopoverOpen,
  });
  const assetNovels: TaskResp[] = (assetNovelsData?.items ?? [])
    .filter((t: TaskResp) => t.status === 'SUCCESS' && t.result?.novel_content);

  const handleSelectAssetNovel = useCallback((task: TaskResp) => {
    const content = task.result?.novel_content as string;
    if (content) {
      setNovelContent(content);
      setNovelTweetContent('');
      setVideoTweetContent('');
      toast({ title: '已加载小说', description: (task.result?.title as string) ?? task.id.slice(0, 8) });
    }
    setAssetPopoverOpen(false);
  }, [setNovelContent, setNovelTweetContent, setVideoTweetContent]);


  // Script tabs state
  const [activeTab, setActiveTab] = useState('novel_tweet');
  const [tabPrompts, setTabPrompts] = useState<Record<string, string>>({ ...SCRIPT_TAB_PROMPTS });
  const [tabConfirmed, setTabConfirmed] = useState<Record<string, boolean>>({
    novel_tweet: false,
    video_tweet: false,
    storyboard: false,
  });

  // ── Video tweet textarea: prepend novel tweet result ──
  // Build the effective value for the video_tweet textarea
  const getVideoTweetValue = useCallback(() => {
    const base = tabPrompts.video_tweet ?? '';
    if (!novelTweetContent) return base;
    if (base.includes(novelTweetContent.slice(0, 50))) return base;
    return `基于小说推文内容：\n${novelTweetContent}\n---\n${base}`;
  }, [tabPrompts.video_tweet, novelTweetContent]);

  // Build storyboard textarea value with video tweet content prepended
  const getStoryboardValue = useCallback(() => {
    const base = tabPrompts.storyboard ?? '';
    if (!videoTweetContent) return base;
    if (base.includes(videoTweetContent.slice(0, 50))) return base;
    return `基于视频推文内容：\n${videoTweetContent}\n---\n${base}`;
  }, [tabPrompts.storyboard, videoTweetContent]);

  // Current effective prompt value — from tabs in script mode, from simple state otherwise
  const currentPrompt = isScriptMode
    ? (activeTab === 'storyboard'
        ? getStoryboardValue()
            .replace('{{视频模型名称}}', storyVars.video_model || '{{视频模型名称}}')
            .replace('{{视频类型}}', storyVars.video_type || '{{视频类型}}')
            .replace('{{多少}}', storyVars.count || '{{多少}}')
        : activeTab === 'video_tweet'
          ? getVideoTweetValue()
          : tabPrompts[activeTab]) ?? ''
    : prompt;

  const [pollingTaskId, setPollingTaskId] = useState<string | null>(null);

  // Poll for task result when a polling task ID is set
  const { data: polledTask } = useQuery({
    queryKey: ['task-poll', pollingTaskId],
    queryFn: async () => {
      const { data } = await tasksApi.get(pollingTaskId!);
      return data;
    },
    enabled: !!pollingTaskId,
    refetchInterval: (query) => {
      const state = query.state.data;
      if (!state) return 1000;
      if (state.status === 'SUCCESS' || state.status === 'FAILED') return false;
      return 1000;
    },
  });

  // ── Draft load on mount ──
  useEffect(() => {
    if (draftLoaded) return;
    if (!initialDraftId) { setDraftLoaded(true); return; }
    (async () => {
      try {
        const { data: full } = await draftsApi.get(initialDraftId);
        const sd = full.step_data;
        setDraftId(full.id);
        draftCreatedRef.current = true;

        if (isScriptMode) {
          if (sd.prompt) setPrompt(sd.prompt as string);
          if (sd.genModel) setSelectedModel(sd.genModel as string);
          if (sd.tabPrompts) setTabPrompts(sd.tabPrompts as Record<string, string>);
          if (sd.tabConfirmed) setTabConfirmed(sd.tabConfirmed as Record<string, boolean>);
          if (sd.activeTab) setActiveTab(sd.activeTab as string);
          if (sd.novelContent) setNovelContent(sd.novelContent as string);
          if (sd.novelTweetContent) setNovelTweetContent(sd.novelTweetContent as string);
          if (sd.videoTweetContent) setVideoTweetContent(sd.videoTweetContent as string);
        } else {
          if (sd.prompt) setPrompt(sd.prompt as string);
          if (sd.genModel) setSelectedModel(sd.genModel as string);
        }

        setDraftLoaded(true);
        toast({ title: '已恢复之前的进度' });
      } catch {
        setDraftLoaded(true);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Draft save logic ──
  const collectStepData = useCallback(() => {
    if (isScriptMode) {
      return {
        prompt,
        genModel: selectedModel,
        tabPrompts,
        tabConfirmed,
        activeTab,
        novelContent,
        novelTweetContent,
        videoTweetContent,
      };
    }
    return { prompt, genModel: selectedModel };
  }, [isScriptMode, prompt, selectedModel, tabPrompts, tabConfirmed, activeTab, novelContent, novelTweetContent, videoTweetContent]);

  const ensureDraft = useCallback(async () => {
    if (draftCreatedRef.current && draftId) return draftId;
    try {
      const { data: newDraft } = await draftsApi.create({ workflow_type: workflowType });
      setDraftId(newDraft.id);
      draftCreatedRef.current = true;
      return newDraft.id;
    } catch {
      return null;
    }
  }, [draftId, workflowType]);

  const saveDraft = useCallback(async (step: string, overrides: Record<string, unknown> = {}, completed = false) => {
    const id = await ensureDraft();
    if (!id) return;
    try {
      const data = collectStepData();
      await draftsApi.update(id, {
        current_step: step,
        status: completed ? 'completed' : 'in_progress',
        step_data: { ...data, ...overrides } as any,
      });
    } catch {
      // Silent fail
    }
  }, [ensureDraft, collectStepData]);

  // Handle polled task reaching terminal state
  useEffect(() => {
    if (!polledTask) return;
    if (polledTask.status === 'SUCCESS') {
      const result = polledTask.result;
      const currentIdx = TAB_ORDER.indexOf(activeTab);
      const nextIdx = currentIdx + 1;

      if (activeTab === 'novel_tweet' && result.novel_tweet_content) {
        setNovelTweetContent(result.novel_tweet_content as string);
      }
      if (activeTab === 'video_tweet' && result.video_tweet_content) {
        setVideoTweetContent(result.video_tweet_content as string);
      }

      if (nextIdx < TAB_ORDER.length) {
        const nextTab = TAB_ORDER[nextIdx];
        if (activeTab === 'novel_tweet' && result.novel_tweet_content) {
          setTabPrompts((prev) => ({
            ...prev,
            video_tweet: `基于小说推文内容：\n${result.novel_tweet_content}\n---\n${SCRIPT_TAB_PROMPTS.video_tweet}`,
          }));
          setTabConfirmed((prev) => ({ ...prev, video_tweet: true }));
        }
        if (activeTab === 'video_tweet' && result.video_tweet_content) {
          setTabPrompts((prev) => ({
            ...prev,
            storyboard: SCRIPT_TAB_PROMPTS.storyboard,
          }));
        }
        setActiveTab(nextTab);
      }
      setPollingTaskId(null);
      setCurrentTaskId(null);
      toast({ title: `${SCRIPT_TABS.find((t) => t.value === activeTab)?.label} 生成完成` });

      // Save draft after successful generation
      if (!isScriptMode) {
        saveDraft(activeTab, { result: result });
      } else {
        saveDraft(activeTab);
      }
    } else if (polledTask.status === 'FAILED') {
      setPollingTaskId(null);
      toast({ title: '任务失败', description: polledTask.error_message || '未知错误', variant: 'destructive' });
    }
  }, [polledTask, activeTab, setNovelTweetContent, setVideoTweetContent, setCurrentTaskId, isScriptMode, saveDraft]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
  }, []);

  const handlePromptChange = useCallback((value: string) => {
    if (isScriptMode) {
      setTabPrompts((prev) => ({ ...prev, [activeTab]: value }));
      if (!tabConfirmed[activeTab]) {
        setTabConfirmed((prev) => ({ ...prev, [activeTab]: true }));
      }
    } else {
      setPrompt(value);
    }
  }, [isScriptMode, activeTab, tabConfirmed]);

  const getTextareaClass = useCallback(() => {
    const base = 'flex min-h-[120px] w-full rounded-md border border-input bg-background px-4 py-3 pr-28 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y';
    if (isScriptMode) {
      const confirmed = tabConfirmed[activeTab];
      return `${base} ${!confirmed ? 'text-muted-foreground' : 'text-foreground'}`;
    }
    return `${base} ${defaultPrompt && !defaultConfirmed ? 'text-muted-foreground' : 'text-foreground'}`;
  }, [isScriptMode, activeTab, tabConfirmed, defaultPrompt, defaultConfirmed]);

  const createMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {};
      if (keywords.trim()) {
        payload.keywords = keywords;
      }
      if (selectedNovelId) {
        payload.novel_id = selectedNovelId;
      }
      if (selectedModel) {
        payload.model = selectedModel;
      }
      if (novelContent) {
        payload.novel_content = novelContent;
      }

      if (isScriptMode) {
        // Send only the current tab's prompt with the corresponding workflow type
        const tabWorkflowType = TAB_WORKFLOW_TYPE[activeTab];
        console.log('[WorkflowPage] sending:', { tabWorkflowType, activeTab });
        if (activeTab === 'novel_tweet') {
          payload.novel_tweet_prompt = tabPrompts.novel_tweet ?? '';
          // Include novel_tweet_content from store if we have it from a prior run
          if (novelTweetContent) {
            payload.novel_tweet_content = novelTweetContent;
          }
        } else if (activeTab === 'video_tweet') {
          payload.video_tweet_prompt = tabPrompts.video_tweet ?? '';
          // Pass the novel_tweet result as context
          if (novelTweetContent) {
            payload.novel_tweet_content = novelTweetContent;
          }
        } else if (activeTab === 'storyboard') {
          const storyTpl = tabPrompts.storyboard ?? '';
          payload.storyboard_prompt = storyTpl
            .replace('{{视频模型名称}}', storyVars.video_model || '{{视频模型名称}}')
            .replace('{{视频类型}}', storyVars.video_type || '{{视频类型}}')
            .replace('{{多少}}', storyVars.count || '{{多少}}');
          if (videoTweetContent) {
            payload.video_tweet_content = videoTweetContent;
          }
        }
        return tasksApi.create({
          workflow_type: tabWorkflowType,
          input_params: payload,
        });
      } else if (currentPrompt.trim()) {
        payload.prompt = currentPrompt.trim();
      }
      return tasksApi.create({
        workflow_type: workflowType,
        input_params: payload,
      });
    },
    onSuccess: ({ data }) => {
      setCurrentTaskId(data.id);
      if (isScriptMode) {
        // Start polling for the result
        setPollingTaskId(data.id);
      }
      // Save draft for non-script modes on task creation
      if (!isScriptMode) {
        saveDraft(activeTab);
      }
    },
    onError: () => {
      toast({ title: '创建任务失败', variant: 'destructive' });
    },
  });

  const handleGenerate = useCallback(() => {
    if (isScriptMode) {
      if (!tabPrompts[activeTab]?.trim() && !keywords.trim()) {
        toast({ title: '请先输入提示词', variant: 'destructive' });
        return;
      }
    } else if (!currentPrompt.trim() && !keywords.trim()) {
      toast({ title: '请先输入提示词', variant: 'destructive' });
      return;
    }
    createMutation.mutate();
  }, [isScriptMode, currentPrompt, keywords, createMutation, tabPrompts, activeTab]);

  const isPending = createMutation.isPending || !!pollingTaskId;


  return (
    <div className="py-8 px-4 max-w-2xl mx-auto space-y-10">
      {/* Header + Prompt Input */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-1">{description}</p>
        </div>

        <div className="space-y-2">
          {novelContent && (
            <details className="rounded-md border border-muted-foreground/20 bg-muted/30">
              <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground select-none">
                参考小说（点击展开）
              </summary>
              <pre className="max-h-80 overflow-y-auto px-4 pb-3 text-sm text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                {novelContent.slice(0, 5000)}{novelContent.length > 5000 ? '\n\n...（已截断）' : ''}
              </pre>
            </details>
          )}

          {isScriptMode ? (
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <div className="flex items-center gap-1">
                <TabsList className="w-full justify-start rounded-lg bg-muted p-1 h-9 flex-1">
                  {SCRIPT_TABS.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="rounded-md px-4 py-1 text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground transition-all flex-1"
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              {SCRIPT_TABS.map((tab) => (
                <TabsContent key={tab.value} value={tab.value} className="mt-2">
                  <div className="relative">
                    <textarea
                      className={getTextareaClass()}
                      placeholder={promptPlaceholder}
                      value={tab.value === 'video_tweet' ? getVideoTweetValue() : tab.value === 'storyboard' ? getStoryboardValue() : (tabPrompts[tab.value] ?? '')}
                      onChange={(e) => {
                        setTabPrompts((prev) => ({ ...prev, [tab.value]: e.target.value }));
                        if (!tabConfirmed[tab.value]) {
                          setTabConfirmed((prev) => ({ ...prev, [tab.value]: true }));
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setTabPrompts((prev) => ({ ...prev, [tab.value]: SCRIPT_TAB_PROMPTS[tab.value] }));
                        setTabConfirmed((prev) => ({ ...prev, [tab.value]: true }));
                      }}
                      rows={4}
                    />
                    <div className="absolute bottom-2 left-3 flex items-center">
                      <div className="relative">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
                          disabled={isUploading}
                          title="添加小说"
                          onClick={() => setAssetPopoverOpen((v) => !v)}
                        >
                          {isUploading ? (
                            <span className="animate-spin text-xs">⟳</span>
                          ) : (
                            <span className="text-lg leading-none">+</span>
                          )}
                        </Button>
                        {assetPopoverOpen && (
                          <>
                            {/* Backdrop to close */}
                            <div className="fixed inset-0 z-40" onClick={() => setAssetPopoverOpen(false)} />
                            <div className="absolute left-0 bottom-full mb-1 z-50 w-56 rounded-md border bg-popover p-1 shadow-md text-sm">
                              <button
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent hover:text-accent-foreground"
                                onClick={() => {
                                  setAssetPopoverOpen(false);
                                  fileInputRef.current?.click();
                                }}
                              >
                                <span className="text-base leading-none">📄</span>
                                上传 .txt 文件
                              </button>
                              <div className="my-1 border-t" />
                              <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                                从资产中选择小说
                              </div>
                              {assetNovels.length === 0 && (
                                <div className="px-2 py-2 text-xs text-muted-foreground">
                                  暂无已生成的小说
                                </div>
                              )}
                              {assetNovels.slice(0, 5).map((task: TaskResp) => (
                                <button
                                  key={task.id}
                                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent hover:text-accent-foreground text-left"
                                  onClick={() => handleSelectAssetNovel(task)}
                                >
                                  <span className="text-xs text-muted-foreground shrink-0">📖</span>
                                  <span className="truncate">
                                    {(task.result?.title as string) || task.id.slice(0, 8)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".txt"
                          className="hidden"
                          onChange={handleFileUpload}
                        />
                      </div>
                    </div>
                    <div className="absolute bottom-2 right-3">
                      <ModelSelector value={selectedModel} onChange={setSelectedModel} />
                    </div>
                  </div>
                  {tab.value === 'storyboard' && (
                    <div className="flex gap-2 mt-2">
                      <input
                        className="flex-1 min-w-0 h-7 rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        placeholder="视频模型名称（如：可灵）"
                        value={storyVars.video_model}
                        onChange={(e) => setStoryVars((prev) => ({ ...prev, video_model: e.target.value }))}
                      />
                      <input
                        className="flex-1 min-w-0 h-7 rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        placeholder="视频类型（如：写实）"
                        value={storyVars.video_type}
                        onChange={(e) => setStoryVars((prev) => ({ ...prev, video_type: e.target.value }))}
                      />
                      <input
                        className="flex-1 min-w-0 h-7 rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        placeholder="分镜数量（如：3）"
                        value={storyVars.count}
                        onChange={(e) => setStoryVars((prev) => ({ ...prev, count: e.target.value }))}
                      />
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <div className="relative">
              <textarea
                className={getTextareaClass()}
                placeholder={promptPlaceholder}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onContextMenu={(e) => {
                  if (defaultPrompt) {
                    e.preventDefault();
                    setPrompt(defaultPrompt);
                    setDefaultConfirmed(true);
                  }
                }}
                rows={4}
              />
              <div className="absolute bottom-2 right-3">
                <ModelSelector value={selectedModel} onChange={setSelectedModel} />
              </div>
            </div>
          )}
          <PromptOptimizer value={currentPrompt} onAccept={(v) => handlePromptChange(v)} />
          {keywords && (
            <p className="text-xs text-muted-foreground">
              使用关键词: <span className="font-medium">{keywords}</span>
            </p>
          )}
        </div>

        <Button
          className="w-full h-12 text-base"
          onClick={handleGenerate}
          disabled={isPending}
        >
          {isPending ? '生成中...' : '生成'}
        </Button>

        {createMutation.isError && (
          <Card className="border-destructive">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-destructive mb-2">
                启动任务失败，请重试。
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => createMutation.mutate()}
              >
                重试
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

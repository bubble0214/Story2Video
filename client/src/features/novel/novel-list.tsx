'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { novelsApi } from '@/services/novels';
import { promptsApi } from '@/services/prompts';
import { tasksApi } from '@/services/tasks';
import { useWorkflowStore } from '@/stores/workflow-store';
import { NovelCard } from './novel-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ModelSelector } from '@/components/model-selector';
import { PromptOptimizer } from '@/components/prompt-optimizer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { Loader2, Sparkles, ChevronRight, CheckCircle2, FileText, BookOpen, Download } from 'lucide-react';
import type { SearchResultItem } from '@/types/novel';
import { Progress } from '@/components/ui/progress';
import { useNovelGeneration } from '@/hooks/use-novel-generation';

interface NovelListProps {
  keywords: string;
  selectedModel?: string;
  initialDraftId?: string;
}

const NOVEL_TABS = [
  { value: 'prompt', label: '创作提示' },
  { value: 'outline', label: '小说大纲' },
  { value: 'volume', label: '第一卷细纲' },
  { value: 'rules', label: '人物守则' },
  { value: 'generate', label: '生成小说' },
];

const TAB_ORDER = ['prompt', 'outline', 'volume', 'rules', 'generate'];

export function NovelList({ keywords, selectedModel, initialDraftId }: NovelListProps) {
  const router = useRouter();
  const {
    customPrompt, setCustomPrompt,
    outlineContent, setOutlineContent,
    volumeOutlineContent, setVolumeOutlineContent,
    characterRulesContent, setCharacterRulesContent,
    novelContent, setNovelContent,
    genModel, setGenModel,
    activeTab, setActiveTab,
    handleTabChange,
    novels, analysis, isLoading, isError, error, refetch,
    draftId, draftTitle, editingTitle, setEditingTitle, setDraftTitle, saveDraft,
    chapters, setChapters,
    totalChapters, generateMode, setGenerateMode,
    isGeneratingChapter, selectedChapterIndex, setSelectedChapterIndex,
    qualityReport, qualityRevisions, qualityRevisionsSummary,
    isAnalyzingChapters, qualityCheckBlocked, setQualityCheckBlocked,
    volumeReviewState, volumeReviewReport, volumeReviewData,
    volume2Outline, showVolumeReviewSheet, setShowVolumeReviewSheet,
    selectedVolumeDecision, setSelectedVolumeDecision,
    isSubmittingDecision, applyVolumeRevisions, setApplyVolumeRevisions,
    finalReviewData,
    showFinalReviewSheet, setShowFinalReviewSheet,
    isSubmittingFinalDecision, applyFinalRevisions, setApplyFinalRevisions,
    handleGenerateChapter, applyQualityRevisions, submitDecision, submitFinalDecision,
    outlineMutation, volumeOutlineMutation, characterRulesMutation,
    isOutlinePending, isVolumeOutlinePending, isCharacterRulesPending,
    polledOutlineTask, polledVolumeOutlineTask, polledCharacterRulesTask,
    analyzeMutation, applyTemplate,
  } = useNovelGeneration({ keywords, selectedModel, initialDraftId });

  const referenceData = useCallback(() =>
    novels.map((n: SearchResultItem) => ({
      id: n.id || '',
      title: n.title,
      author: n.author,
      tags: n.tags,
      summary: n.summary,
      score: n.score,
    })),
  [novels]);

  const inputParamsBase = useCallback(() => ({
    reference_data: referenceData(),
    custom_prompt: customPrompt.trim(),
    ...(genModel ? { model: genModel } : {}),
  }), [referenceData, customPrompt, genModel]);

  // ── Render states ──
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-lg border bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    const axiosError = error as { response?: { data?: { detail?: string } }; message?: string };
    return (
      <div className="text-center py-8">
        <p className="text-destructive mb-2">加载小说失败</p>
        <p className="text-sm text-muted-foreground mb-4">{axiosError.response?.data?.detail || axiosError.message || '发生错误'}</p>
        <Button variant="outline" onClick={() => refetch()}>重试</Button>
      </div>
    );
  }

  if (novels.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">未找到匹配这些关键词的推荐。请尝试其他关键词。</p>
      </div>
    );
  }

  // ── Sections ──
  const referenceNovelsSection = (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">
        参考小说 ({novels.length})
      </h2>
      <p className="text-sm text-muted-foreground">
        以下小说将作为生成时的参考材料。
      </p>
      <div className="grid gap-3">
        {novels.map((novel: SearchResultItem) => (
          <NovelCard key={novel.id || `${novel.title}-${novel.author}`} novel={novel} />
        ))}
      </div>
    </div>
  );

  const analysisSection = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">AI 分析参考小说</h2>
        {novels.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
            className="text-xs h-8"
          >
            {analyzeMutation.isPending ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> 分析中...</>
            ) : (
              <><Sparkles className="h-3 w-3 mr-1" /> AI 分析</>
            )}
          </Button>
        )}
      </div>
      {analysis && (
        <Card className="border-primary/20">
          <CardContent className="pt-4 pb-4 space-y-3">
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{analysis}</pre>
            <div className="flex justify-end">
              <Button variant="default" size="sm" onClick={applyTemplate} className="text-xs h-8">
                <Sparkles className="h-3 w-3 mr-1" /> 套用模板生成
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const promptSection = (
    <Card className="border-primary/30">
      <CardContent className="pt-6 space-y-4">
        <div>
          <h3 className="font-semibold text-base">创作提示</h3>
          <p className="text-sm text-muted-foreground mt-1">
            为 AI 编写你的创作指令。上面的参考小说将用作灵感来源，创作出全新的原创小说。
          </p>
        </div>
        <textarea
          className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
          placeholder="描述你想要创作的小说——类型、角色、剧情方向、写作风格或任何需要包含的特定元素..."
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          rows={4}
        />
        <div className="flex items-center justify-between gap-2">
          <PromptOptimizer value={customPrompt} onAccept={(v) => setCustomPrompt(v)} references={novels as any} />
          <div className="shrink-0">
            <ModelSelector value={genModel} onChange={setGenModel} />
          </div>
        </div>
        <Button
          className="w-full h-12 text-base"
          onClick={() => outlineMutation.mutate()}
          disabled={!customPrompt.trim() || isOutlinePending}
        >
          {isOutlinePending ? (
            <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> 生成大纲中...</>
          ) : (
            <><FileText className="h-5 w-5 mr-2" /> 生成大纲</>
          )}
        </Button>
        {outlineMutation.isPending && polledOutlineTask.data && (polledOutlineTask.data as any).status !== 'SUCCESS' && (polledOutlineTask.data as any).status !== 'FAILED' && (
          <div className="space-y-1">
            <Progress value={(polledOutlineTask.data as any).progress} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{(polledOutlineTask.data as any).current_step || '处理中...'}</span>
              <span>{Math.round((polledOutlineTask.data as any).progress)}%</span>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          <strong>推荐：</strong>先点击"生成大纲"查看章节规划，确认后再生成全文。
        </p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Editable title */}
      <div className="flex items-center gap-2">
        {editingTitle ? (
          <input
            className="flex h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={() => {
              setEditingTitle(false);
              if (draftId && draftTitle.trim()) {
                promptsApi.analyzeChapters({ chapters: [], chapter_count: 0 }).then(
                  () => {}, // noop, just trigger a save
                );
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            autoFocus
          />
        ) : (
          <h1
            className="text-2xl font-bold tracking-tight cursor-pointer hover:text-primary transition-colors"
            onClick={() => setEditingTitle(true)}
            title="点击编辑标题"
          >
            {draftTitle}
          </h1>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full justify-start rounded-lg bg-muted p-1 h-10">
          {NOVEL_TABS.map((tab, i) => {
            const isReachable =
              tab.value === 'prompt' ||
              (tab.value === 'outline' && !!outlineContent) ||
              (tab.value === 'volume' && !!volumeOutlineContent) ||
              (tab.value === 'rules' && !!characterRulesContent) ||
              (tab.value === 'generate' && (!!novelContent || generateMode === 'interactive'));
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                disabled={!isReachable}
                className="rounded-md px-4 py-1.5 text-sm font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground transition-all flex items-center gap-1.5"
              >
                {tab.value === 'prompt' && <Sparkles className="h-3.5 w-3.5" />}
                {tab.value === 'outline' && <FileText className="h-3.5 w-3.5" />}
                {tab.value === 'volume' && <FileText className="h-3.5 w-3.5" />}
                {tab.value === 'rules' && <FileText className="h-3.5 w-3.5" />}
                {tab.value === 'generate' && <CheckCircle2 className="h-3.5 w-3.5" />}
                {tab.label}
                {i < TAB_ORDER.length - 1 && (
                  <ChevronRight className="h-3 w-3 text-muted-foreground/40 ml-0.5" />
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* ════════ TAB 1: 创作提示 ════════ */}
        <TabsContent value="prompt" className="mt-6 space-y-6">
          {referenceNovelsSection}
          {analysisSection}
          {promptSection}
        </TabsContent>

        {/* ════════ TAB 2: 小说大纲 ════════ */}
        <TabsContent value="outline" className="mt-6 space-y-6">
          {outlineContent.trim() ? (
            <>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">小说大纲</h2>
                <p className="text-sm text-muted-foreground mt-1">总纲已生成，请确认后生成第一卷章节细纲。</p>
              </div>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <textarea
                    className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-sans leading-relaxed"
                    value={outlineContent}
                    onChange={(e) => { setOutlineContent(e.target.value); saveDraft('outline', { outlineText: e.target.value }); }}
                  />
                </CardContent>
              </Card>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button variant="outline" onClick={() => setActiveTab('prompt')}>返回修改提示</Button>
                <Button size="lg" onClick={() => volumeOutlineMutation.mutate()} disabled={isVolumeOutlinePending}>
                  {isVolumeOutlinePending ? (
                    <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> 生成细纲中...</>
                  ) : (
                    <><FileText className="h-5 w-5 mr-2" /> 生成第一卷细纲</>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-12 space-y-4">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground">尚未生成大纲。</p>
              <Button variant="outline" onClick={() => setActiveTab('prompt')}>前往创作提示</Button>
            </div>
          )}
        </TabsContent>

        {/* ════════ TAB 3: 第一卷细纲 ════════ */}
        <TabsContent value="volume" className="mt-6 space-y-6">
          {volumeOutlineContent.trim() ? (
            <>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">第一卷章节细纲</h2>
                <p className="text-sm text-muted-foreground mt-1">细纲已生成，共30章。确认后进入下一步建立人物行为守则。</p>
              </div>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <textarea
                    className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-sans leading-relaxed"
                    value={volumeOutlineContent}
                    onChange={(e) => { setVolumeOutlineContent(e.target.value); saveDraft('volume', { volumeOutlineText: e.target.value }); }}
                  />
                </CardContent>
              </Card>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button variant="outline" onClick={() => setActiveTab('outline')}>返回大纲</Button>
                <Button size="lg" onClick={() => characterRulesMutation.mutate()} disabled={isCharacterRulesPending}>
                  {isCharacterRulesPending ? (
                    <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> 生成守则中...</>
                  ) : (
                    <><FileText className="h-5 w-5 mr-2" /> 生成人物守则</>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-12 space-y-4">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground">尚未生成细纲。</p>
              <Button variant="outline" onClick={() => setActiveTab('outline')}>前往大纲</Button>
            </div>
          )}
        </TabsContent>

        {/* ════════ TAB 4: 人物守则 ════════ */}
        <TabsContent value="rules" className="mt-6 space-y-6">
          {characterRulesContent.trim() ? (
            <>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">人物行为守则</h2>
                <p className="text-sm text-muted-foreground mt-1">角色行为守则已生成，确保后续写作中角色言行一致、不崩坏。确认后即可生成完整小说。</p>
              </div>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <textarea
                    className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-sans leading-relaxed"
                    value={characterRulesContent}
                    onChange={(e) => { setCharacterRulesContent(e.target.value); saveDraft('rules', { characterRulesText: e.target.value }); }}
                  />
                </CardContent>
              </Card>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button variant="outline" onClick={() => setActiveTab('volume')}>返回细纲</Button>
                <Button variant="outline" size="lg" onClick={async () => {
                  await saveDraft('generate');
                  setGenerateMode('interactive');
                  setActiveTab('generate');
                }}>
                  <FileText className="h-5 w-5 mr-2" /> 逐章生成
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-12 space-y-4">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground">尚未生成人物守则。</p>
              <Button variant="outline" onClick={() => setActiveTab('volume')}>前往细纲</Button>
            </div>
          )}
        </TabsContent>

        {/* ════════ TAB 5: 生成小说 ════════ */}
        <TabsContent value="generate" className="mt-6 space-y-6">
          {generateMode === 'interactive' ? (
            <>
              {/* Chapter navigation tabs */}
              {chapters.length > 0 && (
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {chapters.map((ch: { title: string; content: string }, i: number) => (
                    <button
                      key={i}
                      onClick={() => setSelectedChapterIndex(i)}
                      className={`shrink-0 px-3 py-1.5 text-sm rounded-md transition-colors ${
                        i === selectedChapterIndex
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {ch.title.length > 12 ? ch.title.slice(0, 12) + '...' : ch.title}
                    </button>
                  ))}
                </div>
              )}

              {/* Current chapter content */}
              {chapters.length > 0 && selectedChapterIndex < chapters.length ? (
                <Card>
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">{chapters[selectedChapterIndex].title}</h3>
                    </div>
                    <textarea
                      className="flex min-h-[300px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-sans leading-relaxed"
                      value={chapters[selectedChapterIndex].content}
                      onChange={(e) => {
                        const updated = [...chapters];
                        updated[selectedChapterIndex] = { ...updated[selectedChapterIndex], content: e.target.value };
                        setChapters(updated);
                      }}
                    />
                  </CardContent>
                </Card>
              ) : isGeneratingChapter ? (
                <Card>
                  <CardContent className="pt-8 pb-8">
                    <div className="text-center space-y-3">
                      <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground/60" />
                      <p className="text-muted-foreground">正在生成第 {chapters.length + 1} 章...</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="pt-8 pb-8">
                    <div className="text-center space-y-3">
                      <FileText className="h-8 w-8 mx-auto text-muted-foreground/40" />
                      <p className="text-muted-foreground">尚未开始生成章节。</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Bottom action bar */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  第 {Math.min(selectedChapterIndex + 1, chapters.length)} / {totalChapters} 章
                  {chapters.length > 0 && `（已生成 ${chapters.length} 章）`}
                </span>
                <div className="flex items-center gap-2">
                  {chapters.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => {
                      const text = chapters
                        .map((ch: { title: string; content: string }) => `# ${ch.title}\n\n${ch.content}`)
                        .join('\n\n---\n\n');
                      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${draftTitle}.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}>
                      <Download className="h-4 w-4 mr-1" /> 下载小说
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setActiveTab('rules')}>
                    返回守则
                  </Button>
                  {volumeReviewState === 'completed' ? (
                    <Button size="sm" onClick={async () => {
                      await saveDraft('generate', {}, true);
                      toast({ title: '小说已完成' });
                    }}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> 完成
                    </Button>
                  ) : volumeReviewState === 'pending_final_review' ? (
                    <Button size="sm" onClick={() => setShowFinalReviewSheet(true)}>
                      <FileText className="h-4 w-4 mr-1" /> 查看完结审阅报告
                    </Button>
                  ) : volumeReviewState === 'executing_v2' || volumeReviewState === 'executing_closing' ? (
                    <Button size="sm" disabled={isGeneratingChapter} onClick={handleGenerateChapter}>
                      {isGeneratingChapter ? (
                        <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 生成下一章</>
                      ) : (
                        <><Sparkles className="h-4 w-4 mr-1" /> 生成下一章</>
                      )}
                    </Button>
                  ) : chapters.length >= totalChapters && volumeReviewState === 'pending_review' ? (
                    <Button size="sm" onClick={() => setShowVolumeReviewSheet(true)}>
                      <FileText className="h-4 w-4 mr-1" /> 查看审阅报告
                    </Button>
                  ) : chapters.length >= totalChapters ? (
                    <Button size="sm" disabled={isGeneratingChapter} onClick={handleGenerateChapter}>
                      {isGeneratingChapter ? (
                        <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 审阅中...</>
                      ) : (
                        <><Sparkles className="h-4 w-4 mr-1" /> 完成第一卷，开始审阅</>
                      )}
                    </Button>
                  ) : (
                    <Button size="sm" disabled={isGeneratingChapter || qualityCheckBlocked} onClick={handleGenerateChapter}>
                      {isGeneratingChapter ? (
                        <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 生成中...</>
                      ) : qualityCheckBlocked ? (
                        <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 质量检查中...</>
                      ) : chapters.length === 0 ? (
                        <><Sparkles className="h-4 w-4 mr-1" /> 生成第一章</>
                      ) : (
                        <><Sparkles className="h-4 w-4 mr-1" /> 确认，生成下一章</>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {/* ── Quality check report sheet ── */}
              <Sheet open={qualityCheckBlocked} onOpenChange={(open) => {
                if (!open && !isAnalyzingChapters) setQualityCheckBlocked(false);
              }}>
                <SheetContent side="right" className="w-full sm:max-w-lg md:max-w-xl">
                  <SheetHeader>
                    <SheetTitle>第 {chapters.length} 章质量检查报告</SheetTitle>
                    <SheetDescription>AI 已完成阶段性质量审查，请阅读报告后确认继续。</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 flex flex-col h-[calc(100vh-12rem)]">
                    {isAnalyzingChapters ? (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="text-center space-y-3">
                          <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground/60" />
                          <p className="text-muted-foreground">AI 正在分析已生成章节...</p>
                        </div>
                      </div>
                    ) : qualityReport ? (
                      <ScrollArea className="flex-1 pr-4">
                        <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed mb-4">{qualityReport}</pre>
                        {qualityRevisions.length > 0 && (
                          <div className="mb-4 space-y-4">
                            <h4 className="font-semibold text-sm flex items-center gap-1.5">
                              <FileText className="h-4 w-4" />
                              差异对比（{qualityRevisions.length} 章建议修改）
                            </h4>
                            {qualityRevisions.map((rev: { chapter_index: number; title: string; content: string }) => {
                              const origChapter = chapters[rev.chapter_index];
                              if (!origChapter) return null;
                              return (
                                <Card key={rev.chapter_index} className="border-amber-200 dark:border-amber-800">
                                  <CardContent className="pt-4 pb-4 space-y-2">
                                    <h5 className="font-medium text-sm">{rev.title} 修改建议</h5>
                                    <div className="grid grid-cols-1 gap-2">
                                      <div>
                                        <p className="text-xs text-muted-foreground mb-1">修改前（部分预览）：</p>
                                        <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed bg-muted p-2 rounded max-h-24 overflow-y-auto">
                                          {origChapter.content.slice(0, 300)}
                                          {origChapter.content.length > 300 ? '...' : ''}
                                        </pre>
                                      </div>
                                      <div>
                                        <p className="text-xs text-muted-foreground mb-1">修改后（部分预览）：</p>
                                        <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed bg-primary/5 p-2 rounded max-h-24 overflow-y-auto">
                                          {rev.content.slice(0, 300)}
                                          {rev.content.length > 300 ? '...' : ''}
                                        </pre>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        )}
                      </ScrollArea>
                    ) : null}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t mt-4">
                      <Button variant="outline" onClick={() => setQualityCheckBlocked(false)} disabled={isAnalyzingChapters}>
                        忽略，继续
                      </Button>
                      <Button onClick={applyQualityRevisions} disabled={isAnalyzingChapters}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> 应用修改
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              {/* ── Volume 1 review sheet ── */}
              <Sheet open={showVolumeReviewSheet} onOpenChange={(open) => {
                if (!open && !isSubmittingDecision) setShowVolumeReviewSheet(false);
              }}>
                <SheetContent side="right" className="w-full sm:max-w-xl md:max-w-2xl">
                  <SheetHeader>
                    <SheetTitle>第一卷完成审阅报告</SheetTitle>
                    <SheetDescription>AI 已审阅全部 {chapters.length} 章，以下是分析报告和后续建议。</SheetDescription>
                  </SheetHeader>
                  <div className="mt-4 flex flex-col h-[calc(100vh-12rem)]">
                    <ScrollArea className="flex-1 pr-4">
                      {volumeReviewReport && (
                        <>
                          <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed mb-6">{volumeReviewReport.review_text}</pre>
                          {volumeReviewReport.analysis_summary && (
                            <div className="mb-6 p-4 bg-muted rounded-lg">
                              <h4 className="font-semibold text-sm mb-2">故事状态分析</h4>
                              <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{volumeReviewReport.analysis_summary}</pre>
                            </div>
                          )}
                          <div className="mb-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                            <p className="text-sm font-medium">AI 推荐：<span className="text-primary">{volumeReviewReport.parsed_decision}</span></p>
                          </div>
                        </>
                      )}
                      {volume2Outline && (
                        <div className="mb-6">
                          <h4 className="font-semibold text-sm mb-2">第二卷细纲预览</h4>
                          <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed bg-muted p-3 rounded-lg max-h-40 overflow-y-auto">{volume2Outline}</pre>
                        </div>
                      )}
                      {volumeReviewData?.revised_chapters && volumeReviewData.revised_chapters.length > 0 && (
                        <div className="mb-6 space-y-4">
                          <h4 className="font-semibold text-sm flex items-center gap-1.5">
                            <FileText className="h-4 w-4" />
                            差异对比（{volumeReviewData.revised_chapters.length} 章建议修改）
                          </h4>
                          {volumeReviewData.revised_chapters.map((rev: any) => {
                            const origChapter = chapters[rev.chapter_index];
                            if (!origChapter) return null;
                            return (
                              <Card key={rev.chapter_index} className="border-amber-200 dark:border-amber-800">
                                <CardContent className="pt-4 pb-4 space-y-2">
                                  <h5 className="font-medium text-sm">{rev.title} 修改建议</h5>
                                  <div className="grid grid-cols-1 gap-2">
                                    <div>
                                      <p className="text-xs text-muted-foreground mb-1">修改前（部分预览）：</p>
                                      <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed bg-muted p-2 rounded max-h-24 overflow-y-auto">
                                        {origChapter.content.slice(0, 300)}
                                        {origChapter.content.length > 300 ? '...' : ''}
                                      </pre>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground mb-1">修改后（部分预览）：</p>
                                      <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed bg-primary/5 p-2 rounded max-h-24 overflow-y-auto">
                                        {rev.content.slice(0, 300)}
                                        {rev.content.length > 300 ? '...' : ''}
                                      </pre>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      )}
                      <div className="space-y-3 pt-2 pb-4">
                        <h4 className="font-semibold text-sm">选择后续方向</h4>
                        {[
                          { value: '续写第二卷', label: '续写第二卷', desc: '故事推进顺利，生成第二卷细纲并继续写作10章' },
                          { value: '修改后继续', label: '修改后继续', desc: '发现需要调整的问题，修改已有章节后完结' },
                          { value: '收束结局', label: '收束结局', desc: '主线冲突即将解决，直接写5章结局收束' },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setSelectedVolumeDecision(opt.value)}
                            className={`w-full text-left p-3 rounded-lg border transition-colors ${
                              selectedVolumeDecision === opt.value
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:bg-muted'
                            }`}
                          >
                            <div className="font-medium text-sm">{opt.label}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                          </button>
                        ))}
                      </div>
                      {volumeReviewData?.revised_chapters && volumeReviewData.revised_chapters.length > 0 && (
                        <div className="flex items-center gap-2 pb-4">
                          <input type="checkbox" id="apply-revisions" checked={applyVolumeRevisions}
                            onChange={(e) => setApplyVolumeRevisions(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300" />
                          <label htmlFor="apply-revisions" className="text-sm">应用以上 {volumeReviewData.revised_chapters.length} 章修改建议</label>
                        </div>
                      )}
                    </ScrollArea>
                    <div className="flex items-center justify-end gap-3 pt-4 border-t mt-4">
                      <Button variant="outline" onClick={() => setShowVolumeReviewSheet(false)} disabled={isSubmittingDecision}>稍后决定</Button>
                      <Button onClick={() => { if (!selectedVolumeDecision) return; submitDecision(selectedVolumeDecision); }}
                        disabled={!selectedVolumeDecision || isSubmittingDecision}>
                        {isSubmittingDecision ? (
                          <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 处理中...</>
                        ) : (
                          <><CheckCircle2 className="h-4 w-4 mr-1" /> 确认选择</>
                        )}
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              {/* ── Final novel review sheet ── */}
              <Sheet open={showFinalReviewSheet} onOpenChange={(open) => {
                if (!open && !isSubmittingFinalDecision) setShowFinalReviewSheet(false);
              }}>
                <SheetContent side="right" className="w-full sm:max-w-xl md:max-w-2xl">
                  <SheetHeader>
                    <SheetTitle>小说完结综合审阅报告</SheetTitle>
                    <SheetDescription>AI 已审阅全部 {chapters.length} 章内容，这是全书最终检查报告。</SheetDescription>
                  </SheetHeader>
                  <div className="mt-4 flex flex-col h-[calc(100vh-12rem)]">
                    <ScrollArea className="flex-1 pr-4">
                      {finalReviewData && (
                        <>
                          <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed mb-6">{finalReviewData.report}</pre>
                          {finalReviewData.revised_chapters && finalReviewData.revised_chapters.length > 0 && (
                            <div className="mb-6 space-y-4">
                              <h4 className="font-semibold text-sm flex items-center gap-1.5">
                                <FileText className="h-4 w-4" />
                                差异对比（{finalReviewData.revised_chapters.length} 章建议修改）
                              </h4>
                              {finalReviewData.revised_chapters.map((rev: any) => {
                                const origChapter = chapters[rev.chapter_index];
                                if (!origChapter) return null;
                                return (
                                  <Card key={rev.chapter_index} className="border-amber-200 dark:border-amber-800">
                                    <CardContent className="pt-4 pb-4 space-y-2">
                                      <h5 className="font-medium text-sm">{rev.title} 修改建议</h5>
                                      <div className="grid grid-cols-1 gap-2">
                                        <div>
                                          <p className="text-xs text-muted-foreground mb-1">修改前（部分预览）：</p>
                                          <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed bg-muted p-2 rounded max-h-24 overflow-y-auto">
                                            {origChapter.content.slice(0, 300)}
                                            {origChapter.content.length > 300 ? '...' : ''}
                                          </pre>
                                        </div>
                                        <div>
                                          <p className="text-xs text-muted-foreground mb-1">修改后（部分预览）：</p>
                                          <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed bg-primary/5 p-2 rounded max-h-24 overflow-y-auto">
                                            {rev.content.slice(0, 300)}
                                            {rev.content.length > 300 ? '...' : ''}
                                          </pre>
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </div>
                          )}
                          <Separator className="my-4" />
                          <div className="mb-4 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                            <h4 className="font-semibold text-sm flex items-center gap-1.5 mb-2">
                              <BookOpen className="h-4 w-4 text-green-600" />
                              小说完结确认
                            </h4>
                            <p className="text-sm text-muted-foreground">阅读以上审阅报告后，你可以选择应用修改建议，然后完成整篇小说。完结后小说将标记为已完成状态。</p>
                          </div>
                        </>
                      )}
                    </ScrollArea>
                    <div className="flex items-center justify-between gap-3 pt-4 border-t mt-4">
                      <div className="flex items-center gap-2">
                        {finalReviewData?.revised_chapters && finalReviewData.revised_chapters.length > 0 && (
                          <>
                            <input type="checkbox" id="apply-final-revisions" checked={applyFinalRevisions}
                              onChange={(e) => setApplyFinalRevisions(e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300" />
                            <label htmlFor="apply-final-revisions" className="text-sm">应用 {finalReviewData.revised_chapters.length} 章修改建议</label>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => setShowFinalReviewSheet(false)} disabled={isSubmittingFinalDecision}>稍后决定</Button>
                        <Button onClick={submitFinalDecision} disabled={isSubmittingFinalDecision}>
                          {isSubmittingFinalDecision ? (
                            <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 处理中...</>
                          ) : (
                            <><CheckCircle2 className="h-4 w-4 mr-1" /> 完结小说</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </>
          ) : (
            /* ── Batch mode ── */
            <>
              {novelContent ? (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold tracking-tight">生成的小说</h2>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setActiveTab('rules')}>返回守则</Button>
                    </div>
                  </div>
                  <Card>
                    <CardContent className="pt-4 pb-4">
                      <textarea
                        className="flex min-h-[300px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-sans leading-relaxed"
                        value={novelContent}
                        onChange={(e) => setNovelContent(e.target.value)}
                      />
                    </CardContent>
                  </Card>
                </>
              ) : (
                <div className="text-center py-12 space-y-4">
                    <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground/40" />
                      <p className="text-muted-foreground">尚未生成小说。</p>
                      <Button variant="outline" onClick={() => setActiveTab('rules')}>前往守则确认</Button>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

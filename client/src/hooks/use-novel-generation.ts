'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { novelsApi } from '@/services/novels';
import { promptsApi } from '@/services/prompts';
import { draftsApi } from '@/services/drafts';
import { useWorkflowStore } from '@/stores/workflow-store';
import { toast } from '@/hooks/use-toast';
import { useNovelMutations } from '@/hooks/use-novel-mutations';
import { useInteractiveGeneration } from '@/hooks/use-interactive-generation';
import { useDraftPersistence } from '@/hooks/use-draft-persistence';
import type { SearchResultItem } from '@/types/novel';

export interface UseNovelGenerationOptions {
  keywords: string;
  selectedModel?: string;
  initialDraftId?: string;
}

export function useNovelGeneration({ keywords, selectedModel, initialDraftId }: UseNovelGenerationOptions) {
  // ── Workflow store ──
  const customPrompt = useWorkflowStore((s) => s.customPrompt);
  const setCustomPrompt = useWorkflowStore((s) => s.setCustomPrompt);
  const outlineContent = useWorkflowStore((s) => s.outlineContent);
  const setOutlineContent = useWorkflowStore((s) => s.setOutlineContent);
  const volumeOutlineContent = useWorkflowStore((s) => s.volumeOutlineContent);
  const setVolumeOutlineContent = useWorkflowStore((s) => s.setVolumeOutlineContent);
  const characterRulesContent = useWorkflowStore((s) => s.characterRulesContent);
  const setCharacterRulesContent = useWorkflowStore((s) => s.setCharacterRulesContent);
  const novelContent = useWorkflowStore((s) => s.novelContent);
  const setNovelContent = useWorkflowStore((s) => s.setNovelContent);

  const [genModel, setGenModel] = useState(selectedModel || '');
  const [activeTab, setActiveTab] = useState('prompt');

  // ── AI Analysis ──
  const [analysis, setAnalysis] = useState<string | null>(null);

  // ── Reference novels query ──
  const keywordList = keywords
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['novels', keywords, selectedModel],
    queryFn: () => novelsApi.search({ keywords: keywordList, model: selectedModel || undefined }),
    enabled: keywordList.length > 0,
    staleTime: 0,
    gcTime: 0,
  });

  const novels: SearchResultItem[] = data?.data ?? [];

  // ── Reference data helpers ──
  const referenceData = useCallback(() =>
    novels.map((n) => ({
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

  // ── Draft persistence ──
  const draftPersistence = useDraftPersistence({ initialDraftId, collectStepData: () => ({}) });
  // collectStepData is replaced below after interactiveGen is created

  // ── Interactive generation (depends on draftId) ──
  const interactiveGen = useInteractiveGeneration({
    draftId: draftPersistence.draftId,
    genModel,
    saveDraft: draftPersistence.saveDraft,
  });

  // Build collectStepData after interactiveGen is available
  const collectStepData = useCallback(() => ({
    schema_version: 1,
    keywords,
    customPrompt,
    genModel,
    references: novels as any[],
    analysis: analysis ?? undefined,
    outlineText: outlineContent,
    volumeOutlineText: volumeOutlineContent,
    characterRulesText: characterRulesContent,
    novelContent,
    chapters: interactiveGen.chapters,
    totalChapters: interactiveGen.totalChapters,
    generateMode: interactiveGen.generateMode ?? undefined,
    qualityReport: interactiveGen.qualityReport ?? undefined,
    qualityRevisions: interactiveGen.qualityRevisions,
    qualityRevisionsSummary: interactiveGen.qualityRevisionsSummary ?? undefined,
    volumeReviewState: interactiveGen.volumeReviewState ?? undefined,
    volumeReviewReport: interactiveGen.volumeReviewReport ?? undefined,
    volumeReviewDecision: interactiveGen.volumeReviewDecision ?? undefined,
    volume2Outline: interactiveGen.volume2Outline ?? undefined,
    finalReviewReport: (interactiveGen.finalReviewData as any)?.report ?? undefined,
    finalReviewRevisions: (interactiveGen.finalReviewData as any)?.revised_chapters ?? undefined,
  }), [keywords, customPrompt, genModel, novels, analysis, outlineContent, volumeOutlineContent, characterRulesContent, novelContent, interactiveGen.chapters, interactiveGen.generateMode, interactiveGen.qualityReport, interactiveGen.qualityRevisions, interactiveGen.qualityRevisionsSummary, interactiveGen.volumeReviewState, interactiveGen.volumeReviewReport, interactiveGen.volumeReviewDecision, interactiveGen.volume2Outline, interactiveGen.finalReviewData]);

  // Re-set collectStepData on draftPersistence after it's built
  useEffect(() => {
    draftPersistence.setCollectStepData(collectStepData);
  }, [collectStepData, draftPersistence.setCollectStepData]);

  // ── Wire up draft restoration ──
  useEffect(() => {
    draftPersistence.setOnRestore(() => interactiveGen.restoreInteractiveState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Apply draft restoration on mount ──
  useEffect(() => {
    if (draftPersistence.draftLoaded && initialDraftId) {
      (async () => {
        try {
          const { data: full } = await draftsApi.get(initialDraftId);
          const sd = full.step_data as any;
          if (sd.customPrompt) setCustomPrompt(sd.customPrompt);
          if (sd.outlineText) setOutlineContent(sd.outlineText);
          if (sd.volumeOutlineText) setVolumeOutlineContent(sd.volumeOutlineText);
          if (sd.characterRulesText) setCharacterRulesContent(sd.characterRulesText);
          if (sd.novelContent) setNovelContent(sd.novelContent);
          if (sd.genModel) setGenModel(sd.genModel);
          if (sd.analysis) setAnalysis(sd.analysis);
          if (sd.keywords !== undefined) setActiveTab('prompt');
        } catch {
          // ignore
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftPersistence.draftLoaded]);

  // ── Mutations (batch) ──
  const novelMutations = useNovelMutations({
    inputParamsBase,
    outlineContent,
    volumeOutlineContent,
    characterRulesContent,
    saveDraft: draftPersistence.saveDraft,
  });

  // ── Poll result effects ──
  const polledOutlineData: any = novelMutations.polledOutlineTask.data;
  useEffect(() => {
    const tab = novelMutations.handleOutlineResult(polledOutlineData);
    if (tab) {
      setActiveTab(tab as string);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polledOutlineData]);

  const polledVolumeData: any = novelMutations.polledVolumeOutlineTask.data;
  useEffect(() => {
    const tab = novelMutations.handleVolumeOutlineResult(polledVolumeData);
    if (tab) setActiveTab(tab as string);
  }, [polledVolumeData, novelMutations.handleVolumeOutlineResult]);

  const polledRulesData: any = novelMutations.polledCharacterRulesTask.data;
  useEffect(() => {
    const tab = novelMutations.handleCharacterRulesResult(polledRulesData);
    if (tab) setActiveTab(tab as string);
  }, [polledRulesData, novelMutations.handleCharacterRulesResult]);

  // ── Analyze mutation ──
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const novelsData = novels.slice(0, 3).map((r) => ({
        title: r.title,
        author: r.author,
        tags: r.tags,
        summary: r.summary,
      }));
      const { data } = await promptsApi.analyzeNovels({ novels: novelsData });
      return data.analysis;
    },
    onSuccess: (result) => setAnalysis(result),
    onError: (err) => {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      toast({ title: 'AI 分析失败', description: typeof e.response?.data?.detail === 'string' ? e.response.data.detail : (e.message || '未知错误'), variant: 'destructive' });
    },
  });

  // ── Apply template ──
  const applyTemplate = useCallback(() => {
    if (!analysis) return;
    const titles = novels.slice(0, 3).map((n) => n.title);
    const template = `你现在是一位专业小说作家。我需要你根据我提供的3部推荐小说，创作出一部全新的、完全原创的小说，要求去除AI味，而不是简单改写或续写。

【3部参考小说及其核心元素】
${analysis}

【创作要求】
1. 请提取以上三部小说最吸引人的"核心设定"和"人物关系张力"，进行打散重构，组合成一个前所未有的新故事。
2. 作品必须原创，不出现任何原作的具体人名、地名、情节段落。可以借鉴"梗"和"关系模式"，但具体故事发展要完全不同。
3. 新小说的整体风格基调和整体氛围根据3部小说重新创建，带一点地摊文学的烟火气。
4. 请先生成一份完整的故事大纲，包含：
   - 新世界观简述（时代背景、核心规则、独特设定）
   - 主要人物设定（至少包含主角、一位核心盟友、一位核心对手；需写出姓名、性格、核心欲望、致命缺陷）
   - 核心冲突（表层冲突 + 深层冲突 + 哲学命题）
   - 300字以内的故事梗概

【防撞车约束】
- 禁止直接出现参考小说中的标志性台词、地名、法宝名。
- 将最精彩的人物关系原型进行"身份反转"。比如原作是师徒虐恋，新作变成"伪装成废物的星际赏金猎人 × 奉命暗杀他的前战友"；原作的技能体系如果是魔法，新作就改成赛博义体或基因锁。
- 关键剧情转折点必须通过"如果……会怎样"的假设来做颠覆。例如："如果恋爱脑的反而是看上去掌控全局的男主，故事会怎么发展？"

【输出格式】
请严格按以下顺序输出：
一、世界观简述（200字以内）
二、主要人物设定（3-5人，每人100字以内）
三、核心冲突（表层/深层/哲学命题）
四、故事梗概（300字以内）`;
    setCustomPrompt(template);
    toast({ title: '已套用创作模板' });
    setTimeout(() => draftPersistence.saveDraft(activeTab), 100);
  }, [analysis, novels, setCustomPrompt, draftPersistence.saveDraft, activeTab]);

  // ── Tab guard ──
  const hasOutline = outlineContent.trim().length > 0;
  const hasVolumeOutline = volumeOutlineContent.trim().length > 0;
  const hasCharacterRules = characterRulesContent.trim().length > 0;

  const handleTabChange = useCallback((tab: string) => {
    if (tab === 'outline' && !hasOutline) return;
    if (tab === 'volume' && !hasVolumeOutline) return;
    if (tab === 'rules' && !hasCharacterRules) return;
    if (tab === 'generate' && !novelContent && interactiveGen.generateMode !== 'interactive') return;
    setActiveTab(tab);
    draftPersistence.saveDraft(tab);
  }, [hasOutline, hasVolumeOutline, hasCharacterRules, novelContent, interactiveGen.generateMode, draftPersistence.saveDraft]);

  // ── Auto-save on user actions (debounced, after draft loaded) ──
  const draftLoaded = draftPersistence.draftLoaded;
  const hasUserContent = customPrompt.trim().length > 0 || outlineContent.trim().length > 0
    || genModel.length > 0 || analysis !== null;
  useEffect(() => {
    if (!draftLoaded) return;
    if (!hasUserContent) return;
    const timer = setTimeout(() => draftPersistence.saveDraft(activeTab), 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftLoaded, customPrompt, outlineContent, volumeOutlineContent, characterRulesContent, novelContent, genModel, analysis]);

  return {
    // Store-derived
    customPrompt, setCustomPrompt,
    outlineContent, setOutlineContent,
    volumeOutlineContent, setVolumeOutlineContent,
    characterRulesContent, setCharacterRulesContent,
    novelContent, setNovelContent,

    // UI state
    genModel, setGenModel,
    activeTab, setActiveTab,
    handleTabChange,

    // Novels & analysis
    novels, analysis, isLoading, isError, error, refetch,

    // Draft persistence
    draftId: draftPersistence.draftId,
    draftTitle: draftPersistence.draftTitle,
    editingTitle: draftPersistence.editingTitle,
    setEditingTitle: draftPersistence.setEditingTitle,
    setDraftTitle: draftPersistence.setDraftTitle,
    saveDraft: draftPersistence.saveDraft,
    draftLoaded: draftPersistence.draftLoaded,

    // Interactive generation — chapters
    chapters: interactiveGen.chapters,
    setChapters: interactiveGen.setChapters,
    totalChapters: interactiveGen.totalChapters,
    generateMode: interactiveGen.generateMode,
    setGenerateMode: interactiveGen.setGenerateMode,
    isGeneratingChapter: interactiveGen.isGeneratingChapter,
    selectedChapterIndex: interactiveGen.selectedChapterIndex,
    setSelectedChapterIndex: interactiveGen.setSelectedChapterIndex,

    // Interactive generation — quality
    qualityReport: interactiveGen.qualityReport,
    qualityRevisions: interactiveGen.qualityRevisions,
    qualityRevisionsSummary: interactiveGen.qualityRevisionsSummary,
    isAnalyzingChapters: interactiveGen.isAnalyzingChapters,
    qualityCheckBlocked: interactiveGen.qualityCheckBlocked,
    setQualityCheckBlocked: interactiveGen.setQualityCheckBlocked,

    // Interactive generation — volume review
    volumeReviewState: interactiveGen.volumeReviewState,
    volumeReviewReport: interactiveGen.volumeReviewReport,
    volumeReviewData: interactiveGen.volumeReviewData,
    volumeReviewDecision: interactiveGen.volumeReviewDecision,
    volume2Outline: interactiveGen.volume2Outline,
    showVolumeReviewSheet: interactiveGen.showVolumeReviewSheet,
    setShowVolumeReviewSheet: interactiveGen.setShowVolumeReviewSheet,
    selectedVolumeDecision: interactiveGen.selectedVolumeDecision,
    setSelectedVolumeDecision: interactiveGen.setSelectedVolumeDecision,
    isSubmittingDecision: interactiveGen.isSubmittingDecision,
    applyVolumeRevisions: interactiveGen.applyVolumeRevisions,
    setApplyVolumeRevisions: interactiveGen.setApplyVolumeRevisions,

    // Interactive generation — final review
    finalReviewData: interactiveGen.finalReviewData,
    showFinalReviewSheet: interactiveGen.showFinalReviewSheet,
    setShowFinalReviewSheet: interactiveGen.setShowFinalReviewSheet,
    isSubmittingFinalDecision: interactiveGen.isSubmittingFinalDecision,
    applyFinalRevisions: interactiveGen.applyFinalRevisions,
    setApplyFinalRevisions: interactiveGen.setApplyFinalRevisions,

    // Interactive generation — actions
    handleGenerateChapter: interactiveGen.handleGenerateChapter,
    applyQualityRevisions: interactiveGen.applyQualityRevisions,
    submitDecision: interactiveGen.submitDecision,
    submitFinalDecision: interactiveGen.submitFinalDecision,

    // Batch mutations
    outlineMutation: novelMutations.outlineMutation,
    volumeOutlineMutation: novelMutations.volumeOutlineMutation,
    characterRulesMutation: novelMutations.characterRulesMutation,

    // Polling state
    isOutlinePending: novelMutations.isOutlinePending,
    isVolumeOutlinePending: novelMutations.isVolumeOutlinePending,
    isCharacterRulesPending: novelMutations.isCharacterRulesPending,
    polledOutlineTask: novelMutations.polledOutlineTask,
    polledVolumeOutlineTask: novelMutations.polledVolumeOutlineTask,
    polledCharacterRulesTask: novelMutations.polledCharacterRulesTask,

    // Analysis
    analyzeMutation,
    applyTemplate,
  };
}

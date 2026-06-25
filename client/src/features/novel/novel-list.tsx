'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { novelsApi } from '@/services/novels';
import { promptsApi } from '@/services/prompts';
import { tasksApi } from '@/services/tasks';
import { draftsApi } from '@/services/drafts';
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
import type { NovelDraftStepData, ChapterRevision } from '@/types/draft';
import { Progress } from '@/components/ui/progress';

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
  const setCurrentTaskId = useWorkflowStore((s) => s.setCurrentTaskId);
  const [genModel, setGenModel] = useState(selectedModel || '');
  const [activeTab, setActiveTab] = useState('prompt');

  // ── Outline task polling ──
  const [outlinePollingTaskId, setOutlinePollingTaskId] = useState<string | null>(null);

  // ── Volume outline task polling ──
  const [volumeOutlinePollingTaskId, setVolumeOutlinePollingTaskId] = useState<string | null>(null);

  // ── Character rules task polling ──
  const [characterRulesPollingTaskId, setCharacterRulesPollingTaskId] = useState<string | null>(null);

  // ── Novel-from-outline task polling ──
  const [novelPollingTaskId, setNovelPollingTaskId] = useState<string | null>(null);

  // ── Interactive chapter-by-chapter generation state ──
  const [chapters, setChapters] = useState<{ title: string; content: string }[]>([]);
  const [totalChapters, setTotalChapters] = useState(30);
  const [generateMode, setGenerateMode] = useState<'batch' | 'interactive' | null>(null);
  const [isGeneratingChapter, setIsGeneratingChapter] = useState(false);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);

  // ── Quality check state ──
  const [qualityReport, setQualityReport] = useState<string | null>(null);
  const [qualityRevisions, setQualityRevisions] = useState<ChapterRevision[]>([]);
  const [qualityRevisionsSummary, setQualityRevisionsSummary] = useState<string>('');
  const [isAnalyzingChapters, setIsAnalyzingChapters] = useState(false);
  const [qualityCheckBlocked, setQualityCheckBlocked] = useState(false);

  // ── Volume review state (first 30 chapters completed) ──
  const [volumeReviewState, setVolumeReviewState] = useState<string | null>(null);
  const [volumeReviewReport, setVolumeReviewReport] = useState<any>(null);
  const [volumeReviewData, setVolumeReviewData] = useState<any>(null);
  const [volumeReviewDecision, setVolumeReviewDecision] = useState<string | null>(null);
  const [volume2Outline, setVolume2Outline] = useState<string | null>(null);
  const [showVolumeReviewSheet, setShowVolumeReviewSheet] = useState(false);
  const [selectedVolumeDecision, setSelectedVolumeDecision] = useState<string | null>(null);
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);

  // ── Final novel review state (v2/closing arc completed) ──
  const [finalReviewData, setFinalReviewData] = useState<any>(null);
  const [showFinalReviewSheet, setShowFinalReviewSheet] = useState(false);
  const [isSubmittingFinalDecision, setIsSubmittingFinalDecision] = useState(false);
  const [applyFinalRevisions, setApplyFinalRevisions] = useState(false);

  useEffect(() => {
    if (draftLoaded) return;
    if (!initialDraftId) { setDraftLoaded(true); return; }
    (async () => {
      try {
        const { data: full } = await draftsApi.get(initialDraftId);
        const sd = full.step_data as NovelDraftStepData;
        setDraftId(full.id);
        draftCreatedRef.current = true;
        setDraftTitle(full.title || '未命名');
        if (sd.keywords !== undefined) setActiveTab('prompt');
        if (sd.customPrompt) setCustomPrompt(sd.customPrompt);
        if (sd.outlineText) setOutlineContent(sd.outlineText);
        if (sd.volumeOutlineText) setVolumeOutlineContent(sd.volumeOutlineText);
        if (sd.characterRulesText) setCharacterRulesContent(sd.characterRulesText);
        if (sd.novelContent) setNovelContent(sd.novelContent);
        if (sd.genModel) setGenModel(sd.genModel);
        if (sd.chapters) setChapters(sd.chapters);
        if (sd.totalChapters) setTotalChapters(sd.totalChapters);
        if (sd.generateMode) setGenerateMode(sd.generateMode as 'batch' | 'interactive');
        if (sd.qualityReport) setQualityReport(sd.qualityReport);
        if (sd.qualityRevisions) setQualityRevisions(sd.qualityRevisions);
        if (sd.qualityRevisionsSummary) setQualityRevisionsSummary(sd.qualityRevisionsSummary);
        if (sd.volumeReviewState) setVolumeReviewState(sd.volumeReviewState);
        if (sd.volumeReviewReport) {
          setVolumeReviewReport(sd.volumeReviewReport);
          setVolumeReviewData({ volume_review_report: sd.volumeReviewReport });
        }
        if (sd.volumeReviewDecision) setVolumeReviewDecision(sd.volumeReviewDecision);
        if (sd.volume2Outline) setVolume2Outline(sd.volume2Outline);
        // Final review state
        if (sd.volumeReviewState === 'pending_final_review' && sd.finalReviewReport) {
          setFinalReviewData({
            report: sd.finalReviewReport,
            revised_chapters: sd.finalReviewRevisions ?? [],
          });
          setShowFinalReviewSheet(true);
        }
        // Re-open review sheet if pending
        if (sd.volumeReviewState === 'pending_review' && sd.volumeReviewReport) {
          setShowVolumeReviewSheet(true);
        }
        const tab = full.current_step;
        if (['prompt', 'outline', 'volume', 'rules', 'generate'].includes(tab)) {
          setActiveTab(tab);
        }
        setDraftLoaded(true);
        toast({ title: '已恢复之前的小说进度' });
      } catch {
        setDraftLoaded(true);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const keywordList = keywords
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['novels', keywords],
    queryFn: () => novelsApi.search({ keywords: keywordList }),
    enabled: keywordList.length > 0,
    staleTime: 0,
    gcTime: 0,
  });

  const novels: SearchResultItem[] = data?.data ?? [];

  // ── AI Analysis of reference novels ──
  const [analysis, setAnalysis] = useState<string | null>(null);

  // ── Draft persistence (must be below novels & analysis) ──
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('未命名');
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const draftCreatedRef = useRef(false);

  const collectStepData = useCallback(() => ({
    keywords,
    customPrompt,
    genModel,
    references: novels as any[],
    analysis: analysis ?? undefined,
    outlineText: outlineContent,
    volumeOutlineText: volumeOutlineContent,
    characterRulesText: characterRulesContent,
    novelContent,
    chapters,
    totalChapters,
    generateMode: (generateMode ?? undefined) as 'batch' | 'interactive' | undefined,
    qualityReport,
    qualityRevisions,
    qualityRevisionsSummary,
    volumeReviewState,
    volumeReviewReport,
    volumeReviewDecision,
    volume2Outline,
    finalReviewReport: finalReviewData?.report ?? undefined,
    finalReviewRevisions: finalReviewData?.revised_chapters ?? undefined,
  }), [keywords, customPrompt, genModel, novels, analysis, outlineContent, volumeOutlineContent, characterRulesContent, novelContent, chapters, totalChapters, generateMode, qualityReport, qualityRevisions, qualityRevisionsSummary, volumeReviewState, volumeReviewReport, volumeReviewDecision, volume2Outline, finalReviewData]);

  const ensureDraft = useCallback(async () => {
    if (draftCreatedRef.current && draftId) return draftId;
    try {
      const { data: newDraft } = await draftsApi.create({ workflow_type: 'novel' });
      setDraftId(newDraft.id);
      setDraftTitle(newDraft.title || '未命名');
      draftCreatedRef.current = true;
      return newDraft.id;
    } catch {
      return null;
    }
  }, [draftId]);

  const saveDraft = useCallback(async (step: string, overrides: Partial<Record<string, any>> = {}, completed = false) => {
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

  // ── Fill prompt template with analysis result ──
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
  }, [analysis, novels, setCustomPrompt]);

  // ── Build reference_data for API calls ──
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

  // ── Outline generation mutation ──
  const outlineMutation = useMutation({
    mutationFn: () =>
      tasksApi.create({
        workflow_type: 'generate_outline_only',
        input_params: inputParamsBase(),
      }),
    onSuccess: ({ data }) => {
      setCurrentTaskId(data.id);
      setOutlinePollingTaskId(data.id);
    },
    onError: (err) => {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      toast({ title: '大纲生成失败', description: e.response?.data?.detail || e.message, variant: 'destructive' });
    },
  });

  // ── Novel-from-outline mutation ──
  const novelMutation = useMutation({
    mutationFn: () => {
      const useCharacterRules = characterRulesContent.trim().length > 0;
      const useVolume = volumeOutlineContent.trim().length > 0;
      return tasksApi.create({
        workflow_type: useCharacterRules
          ? 'generate_novel_with_character_rules'
          : useVolume
            ? 'generate_novel_with_volume_outline'
            : 'generate_novel_with_outline',
        input_params: {
          ...inputParamsBase(),
          ...(useCharacterRules
            ? { character_rules_text: characterRulesContent, volume_outline_text: volumeOutlineContent }
            : useVolume
              ? { volume_outline_text: volumeOutlineContent }
              : { outline_text: outlineContent }),
        },
      });
    },
    onSuccess: ({ data }) => {
      setCurrentTaskId(data.id);
      setNovelPollingTaskId(data.id);
    },
    onError: (err) => {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      const detail = e.response?.data?.detail;
      toast({ title: '小说生成失败', description: typeof detail === 'string' ? detail : (e.message || '未知错误'), variant: 'destructive' });
    },
  });

  // ── Interactive chapter-by-chapter generation mutation ──
  const generateChapterMutation = useMutation({
    mutationFn: async () => {
      const { data } = await draftsApi.generateChapter(draftId!, {
        gen_model: genModel || undefined,
      });
      return data;
    },
    onSuccess: (data) => {
      // Check for volume review (30 chapters done)
      if (data.volume_review) {
        const volReview = data.volume_review;
        setVolumeReviewReport(volReview.volume_review_report);
        setVolumeReviewData(volReview);
        setVolume2Outline(volReview.volume_2_outline ?? null);
        setSelectedVolumeDecision(volReview.volume_review_report.parsed_decision);
        setVolumeReviewState('pending_review');
        setShowVolumeReviewSheet(true);
        setIsGeneratingChapter(false);
        saveDraft('generate', { volumeReviewState: 'pending_review', volumeReviewReport: volReview.volume_review_report, volume2Outline: volReview.volume_2_outline ?? undefined });
        return;
      }

      // Check for final novel review (v2/closing arc completed)
      if (data.final_review) {
        const frData = data.final_review;
        setFinalReviewData(frData);
        setVolumeReviewState('pending_final_review');
        setShowFinalReviewSheet(true);
        setIsGeneratingChapter(false);
        saveDraft('generate', {
          volumeReviewState: 'pending_final_review',
          finalReviewReport: frData.report,
          finalReviewRevisions: frData.revised_chapters ?? [],
        });
        return;
      }

      const updatedChapters = (data.draft.step_data.chapters ?? []) as { title: string; content: string }[];
      setChapters(updatedChapters);
      setTotalChapters(data.total_chapters);
      setSelectedChapterIndex(data.chapter_num - 1);
      setIsGeneratingChapter(false);
      // Update novelContent in store for backward compatibility
      const fullText = updatedChapters.map(
        (ch: { title: string; content: string }) => `# ${ch.title}\n\n${ch.content}`
      ).join('\n\n---\n\n');
      setNovelContent(fullText);
      // Trigger quality check every 10 chapters
      if (data.quality_check_needed) {
        setQualityCheckBlocked(true);
        setIsAnalyzingChapters(true);
        analyzeChaptersMutation.mutate(updatedChapters);
      }
    },
    onError: (err) => {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      const detail = e.response?.data?.detail;
      toast({ title: '章节生成失败', description: typeof detail === 'string' ? detail : (e.message || '未知错误'), variant: 'destructive' });
      setIsGeneratingChapter(false);
    },
  });

  // ── Quality analysis mutation (triggered every 10 chapters) ──
  const analyzeChaptersMutation = useMutation({
    mutationFn: async (currentChapters: { title: string; content: string }[]) => {
      const { data } = await promptsApi.analyzeChapters({
        chapters: currentChapters.map((ch) => ({ title: ch.title, content: ch.content })),
        chapter_count: currentChapters.length,
      });
      return data;
    },
    onSuccess: (data) => {
      setQualityReport(data.report);
      setQualityRevisions(data.revisions ?? []);
      setQualityRevisionsSummary(data.revisions_summary ?? '');
      setIsAnalyzingChapters(false);
      saveDraft('generate', {
        qualityReport: data.report,
        qualityRevisions: data.revisions ?? [],
        qualityRevisionsSummary: data.revisions_summary ?? '',
      });
    },
    onError: (err) => {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      toast({ title: '质量检查失败', description: e.response?.data?.detail || e.message, variant: 'destructive' });
      setIsAnalyzingChapters(false);
      setQualityCheckBlocked(false);
    },
  });

  // ── Volume review decision mutation ──
  const [applyVolumeRevisions, setApplyVolumeRevisions] = useState(false);
  const submitDecisionMutation = useMutation({
    mutationFn: async (decision: string) => {
      const { data } = await draftsApi.submitVolumeDecision(draftId!, {
        decision: decision as any,
        apply_revisions: applyVolumeRevisions,
      });
      return data;
    },
    onSuccess: (data) => {
      setShowVolumeReviewSheet(false);
      setIsSubmittingDecision(false);
      setVolumeReviewDecision(selectedVolumeDecision);

      if ('chapter_num' in data && data.chapter_num) {
        // Got a new chapter (v2 or closing)
        const ch = data as any;
        const newChapter = { title: ch.chapter_title, content: ch.chapter_content };
        setChapters((prev) => [...prev, newChapter]);
        setTotalChapters(ch.total_chapters);
        setSelectedChapterIndex(ch.chapter_num - 1);
        setVolumeReviewState(ch.chapter_num >= 31 && ch.chapter_num <= 40 ? 'executing_v2' : 'executing_closing');
        saveDraft('generate', {
          volumeReviewState: ch.chapter_num >= 31 && ch.chapter_num <= 40 ? 'executing_v2' : 'executing_closing',
          volumeReviewDecision: selectedVolumeDecision!,
          totalChapters: ch.total_chapters,
          chapters: [...chapters, newChapter],
        });
      } else {
        // "修改后继续" — mark complete
        setVolumeReviewState('completed');
        saveDraft('generate', { volumeReviewState: 'completed', volumeReviewDecision: selectedVolumeDecision! }, true);
        toast({ title: '第一卷已完结', description: '章节修改已应用' });
      }
    },
    onError: (err) => {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      toast({ title: '决策提交失败', description: e.response?.data?.detail || e.message, variant: 'destructive' });
      setIsSubmittingDecision(false);
    },
  });

  // ── Final novel review decision mutation ──
  const submitFinalDecisionMutation = useMutation({
    mutationFn: async () => {
      const { data } = await draftsApi.submitFinalDecision(draftId!, {
        apply_revisions: applyFinalRevisions,
        mark_complete: true,
      });
      return data;
    },
    onSuccess: (data) => {
      setShowFinalReviewSheet(false);
      setIsSubmittingFinalDecision(false);
      setVolumeReviewState('completed');
      saveDraft('generate', { volumeReviewState: 'completed', finalReviewApplied: applyFinalRevisions }, true);
      toast({ title: '小说已完结', description: data.message });
    },
    onError: (err) => {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      toast({ title: '提交失败', description: e.response?.data?.detail || e.message, variant: 'destructive' });
      setIsSubmittingFinalDecision(false);
    },
  });

  // ── Volume outline mutation ──
  const volumeOutlineMutation = useMutation({
    mutationFn: () =>
      tasksApi.create({
        workflow_type: 'generate_volume_outline_only',
        input_params: {
          ...inputParamsBase(),
          outline_text: outlineContent,
        },
      }),
    onSuccess: ({ data }) => {
      setCurrentTaskId(data.id);
      setVolumeOutlinePollingTaskId(data.id);
    },
    onError: (err) => {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      toast({ title: '细纲生成失败', description: e.response?.data?.detail || e.message, variant: 'destructive' });
    },
  });

  // ── Character rules generation mutation ──
  const characterRulesMutation = useMutation({
    mutationFn: () =>
      tasksApi.create({
        workflow_type: 'generate_character_rules_only',
        input_params: {
          ...inputParamsBase(),
          outline_text: outlineContent,
          volume_outline_text: volumeOutlineContent,
        },
      }),
    onSuccess: ({ data }) => {
      setCurrentTaskId(data.id);
      setCharacterRulesPollingTaskId(data.id);
    },
    onError: (err) => {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      toast({ title: '人物守则生成失败', description: e.response?.data?.detail || e.message, variant: 'destructive' });
    },
  });

  // ── Poll for outline result ──
  const { data: polledOutlineTask } = useQuery({
    queryKey: ['task-poll-outline', outlinePollingTaskId],
    queryFn: async () => {
      const { data } = await tasksApi.get(outlinePollingTaskId!);
      return data;
    },
    enabled: !!outlinePollingTaskId,
    refetchInterval: (query) => {
      const state = query.state.data;
      if (!state) return 1000;
      if (state.status === 'SUCCESS' || state.status === 'FAILED') return false;
      return 1000;
    },
  });

  useEffect(() => {
    if (!polledOutlineTask) return;
    if (polledOutlineTask.status === 'SUCCESS') {
      const result = polledOutlineTask.result;
      const outlineText = result?.outline_text as string | undefined;
      if (outlineText && outlineText.trim()) {
        setOutlineContent(outlineText);
        setActiveTab('outline');
        toast({ title: '大纲生成完成', description: '请查看并确认大纲内容' });
        saveDraft('outline', { outlineText });
      } else {
        toast({ title: '大纲生成异常', description: '未获取到有效大纲', variant: 'destructive' });
      }
      setOutlinePollingTaskId(null);
      setCurrentTaskId(null);
    } else if (polledOutlineTask.status === 'FAILED') {
      setOutlinePollingTaskId(null);
      toast({ title: '大纲生成失败', description: polledOutlineTask.error_message || '未知错误', variant: 'destructive' });
    }
  }, [polledOutlineTask, setOutlineContent, setCurrentTaskId, saveDraft]);

  // ── Poll for volume outline result ──
  const { data: polledVolumeOutlineTask } = useQuery({
    queryKey: ['task-poll-volume-outline', volumeOutlinePollingTaskId],
    queryFn: async () => {
      const { data } = await tasksApi.get(volumeOutlinePollingTaskId!);
      return data;
    },
    enabled: !!volumeOutlinePollingTaskId,
    refetchInterval: (query) => {
      const state = query.state.data;
      if (!state) return 1000;
      if (state.status === 'SUCCESS' || state.status === 'FAILED') return false;
      return 1000;
    },
  });

  useEffect(() => {
    if (!polledVolumeOutlineTask) return;
    if (polledVolumeOutlineTask.status === 'SUCCESS') {
      const result = polledVolumeOutlineTask.result;
      const volOutline = result?.volume_outline_text as string | undefined;
      if (volOutline && volOutline.trim()) {
        setVolumeOutlineContent(volOutline);
        setActiveTab('volume');
        toast({ title: '第一卷细纲生成完成', description: '请查看并确认细纲，然后开始生成小说' });
        saveDraft('volume', { volumeOutlineText: volOutline });
      } else {
        toast({ title: '细纲生成异常', description: '未获取到有效细纲', variant: 'destructive' });
      }
      setVolumeOutlinePollingTaskId(null);
      setCurrentTaskId(null);
    } else if (polledVolumeOutlineTask.status === 'FAILED') {
      setVolumeOutlinePollingTaskId(null);
      toast({ title: '细纲生成失败', description: polledVolumeOutlineTask.error_message || '未知错误', variant: 'destructive' });
    }
  }, [polledVolumeOutlineTask, setVolumeOutlineContent, setCurrentTaskId, saveDraft]);

  // ── Poll for character rules result ──
  const { data: polledCharacterRulesTask } = useQuery({
    queryKey: ['task-poll-character-rules', characterRulesPollingTaskId],
    queryFn: async () => {
      const { data } = await tasksApi.get(characterRulesPollingTaskId!);
      return data;
    },
    enabled: !!characterRulesPollingTaskId,
    refetchInterval: (query) => {
      const state = query.state.data;
      if (!state) return 1000;
      if (state.status === 'SUCCESS' || state.status === 'FAILED') return false;
      return 1000;
    },
  });

  useEffect(() => {
    if (!polledCharacterRulesTask) return;
    if (polledCharacterRulesTask.status === 'SUCCESS') {
      const result = polledCharacterRulesTask.result;
      const rules = result?.character_rules_text as string | undefined;
      if (rules && rules.trim()) {
        setCharacterRulesContent(rules);
        setActiveTab('rules');
        toast({ title: '人物行为守则生成完成', description: '请查看守则细节，确认角色行为一致性' });
        saveDraft('rules', { characterRulesText: rules });
      } else {
        toast({ title: '守则生成异常', description: '未获取到有效守则', variant: 'destructive' });
      }
      setCharacterRulesPollingTaskId(null);
      setCurrentTaskId(null);
    } else if (polledCharacterRulesTask.status === 'FAILED') {
      setCharacterRulesPollingTaskId(null);
      toast({ title: '人物守则生成失败', description: polledCharacterRulesTask.error_message || '未知错误', variant: 'destructive' });
    }
  }, [polledCharacterRulesTask, setCharacterRulesContent, setCurrentTaskId, saveDraft]);

  // ── Poll for novel result ──
  const { data: polledNovelTask } = useQuery({
    queryKey: ['task-poll-novel', novelPollingTaskId],
    queryFn: async () => {
      const { data } = await tasksApi.get(novelPollingTaskId!);
      return data;
    },
    enabled: !!novelPollingTaskId,
    refetchInterval: (query) => {
      const state = query.state.data;
      if (!state) return 1000;
      if (state.status === 'SUCCESS' || state.status === 'FAILED') return false;
      return 1000;
    },
  });

  useEffect(() => {
    if (!polledNovelTask) return;
    if (polledNovelTask.status === 'SUCCESS') {
      const result = polledNovelTask.result;
      const novelContentVal = result?.novel_content as string | undefined;
      if (novelContentVal) {
        setNovelContent(novelContentVal);
      }
      setActiveTab('generate');
      setNovelPollingTaskId(null);
      setCurrentTaskId(null);
      toast({ title: '小说生成完成' });
      saveDraft('generate', { novelContent: novelContentVal ?? '' }, true);
    } else if (polledNovelTask.status === 'FAILED') {
      setNovelPollingTaskId(null);
      toast({ title: '小说生成失败', description: polledNovelTask.error_message || '未知错误', variant: 'destructive' });
    }
  }, [polledNovelTask, setNovelContent, setCurrentTaskId, saveDraft]);

  // ── Outline is plain text, no JSON parsing needed ──
  const hasOutline = outlineContent.trim().length > 0;
  const hasVolumeOutline = volumeOutlineContent.trim().length > 0;
  const hasCharacterRules = characterRulesContent.trim().length > 0;

  // ── Tab change guard: block tabs that shouldn't be accessible yet ──
  const handleTabChange = useCallback((tab: string) => {
    if (tab === 'outline' && !hasOutline) return;
    if (tab === 'volume' && !hasVolumeOutline) return;
    if (tab === 'rules' && !hasCharacterRules) return;
    if (tab === 'generate' && !novelContent && generateMode !== 'interactive') return;
    setActiveTab(tab);
  }, [hasOutline, hasVolumeOutline, hasCharacterRules, novelContent, generateMode]);

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

  const isOutlinePending = outlineMutation.isPending || !!outlinePollingTaskId;
  const isVolumeOutlinePending = volumeOutlineMutation.isPending || !!volumeOutlinePollingTaskId;
  const isCharacterRulesPending = characterRulesMutation.isPending || !!characterRulesPollingTaskId;
  const isNovelPending = novelMutation.isPending || !!novelPollingTaskId;

  // ── Reference novels section (shared) ──
  const referenceNovelsSection = (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">
        参考小说 ({novels.length})
      </h2>
      <p className="text-sm text-muted-foreground">
        以下小说将作为生成时的参考材料。
      </p>
      <div className="grid gap-3">
        {novels.map((novel) => (
          <NovelCard key={novel.id || `${novel.title}-${novel.author}`} novel={novel} />
        ))}
      </div>
    </div>
  );

  // ── AI Analysis section (shared) ──
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
              <Button
                variant="default"
                size="sm"
                onClick={applyTemplate}
                className="text-xs h-8"
              >
                <Sparkles className="h-3 w-3 mr-1" /> 套用模板生成
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  // ── Prompt textarea (shared) ──
  const promptSection = (
    <Card className="border-primary/30">
      <CardContent className="pt-6 space-y-4">
        <div>
          <h3 className="font-semibold text-base">创作提示</h3>
          <p className="text-sm text-muted-foreground mt-1">
            为 AI 编写你的创作指令。上面的参考小说将用作灵感来源，
            创作出全新的原创小说。
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
          <PromptOptimizer value={customPrompt} onAccept={(v) => setCustomPrompt(v)} references={novels} />
          <div className="shrink-0">
            <ModelSelector value={genModel} onChange={setGenModel} />
          </div>
        </div>

        {/* Generate outline — primary action */}
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

        {outlinePollingTaskId && polledOutlineTask && polledOutlineTask.status !== 'SUCCESS' && polledOutlineTask.status !== 'FAILED' && (
          <div className="space-y-1">
            <Progress value={polledOutlineTask.progress} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{polledOutlineTask.current_step || '处理中...'}</span>
              <span>{Math.round(polledOutlineTask.progress)}%</span>
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
                draftsApi.update(draftId, { title: draftTitle.trim() });
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
        {hasOutline ? (
          <>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">小说大纲</h2>
              <p className="text-sm text-muted-foreground mt-1">
                总纲已生成，请确认后生成第一卷章节细纲。
              </p>
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
              <Button
                variant="outline"
                onClick={() => setActiveTab('prompt')}
              >
                返回修改提示
              </Button>
              <Button
                size="lg"
                onClick={() => volumeOutlineMutation.mutate()}
                disabled={isVolumeOutlinePending}
              >
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
            <Button variant="outline" onClick={() => setActiveTab('prompt')}>
              前往创作提示
            </Button>
          </div>
        )}
      </TabsContent>

      {/* ════════ TAB 3: 第一卷细纲 ════════ */}
      <TabsContent value="volume" className="mt-6 space-y-6">
        {hasVolumeOutline ? (
          <>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">第一卷章节细纲</h2>
              <p className="text-sm text-muted-foreground mt-1">
                细纲已生成，共30章。确认后进入下一步建立人物行为守则。
              </p>
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
              <Button
                variant="outline"
                onClick={() => setActiveTab('outline')}
              >
                返回大纲
              </Button>
              <Button
                size="lg"
                onClick={() => characterRulesMutation.mutate()}
                disabled={isCharacterRulesPending}
              >
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
            <Button variant="outline" onClick={() => setActiveTab('outline')}>
              前往大纲
            </Button>
          </div>
        )}
      </TabsContent>

      {/* ════════ TAB 4: 人物守则 ════════ */}
      <TabsContent value="rules" className="mt-6 space-y-6">
        {hasCharacterRules ? (
          <>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">人物行为守则</h2>
              <p className="text-sm text-muted-foreground mt-1">
                角色行为守则已生成，确保后续写作中角色言行一致、不崩坏。确认后即可生成完整小说。
              </p>
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
              <Button
                variant="outline"
                onClick={() => setActiveTab('volume')}
              >
                返回细纲
              </Button>
              <Button
                size="lg"
                onClick={() => novelMutation.mutate()}
                disabled={isNovelPending}
              >
                {isNovelPending ? (
                  <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> 生成小说中...</>
                ) : (
                  <><Sparkles className="h-5 w-5 mr-2" /> 确认守则并生成小说</>
                )}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={async () => {
                  await saveDraft('generate');
                  setGenerateMode('interactive');
                  setActiveTab('generate');
                }}
              >
                <FileText className="h-5 w-5 mr-2" /> 逐章生成
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-12 space-y-4">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">尚未生成人物守则。</p>
            <Button variant="outline" onClick={() => setActiveTab('volume')}>
              前往细纲
            </Button>
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
                {chapters.map((ch, i) => (
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const text = chapters
                        .map((ch) => `# ${ch.title}\n\n${ch.content}`)
                        .join('\n\n---\n\n');
                      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${draftTitle}.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="h-4 w-4 mr-1" /> 下载小说
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('rules')}
                >
                  返回守则
                </Button>
                {volumeReviewState === 'completed' ? (
                  <Button
                    size="sm"
                    onClick={async () => {
                      await saveDraft('generate', {}, true);
                      toast({ title: '小说已完成' });
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" /> 完成
                  </Button>
                ) : volumeReviewState === 'pending_final_review' ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      setShowFinalReviewSheet(true);
                    }}
                  >
                    <FileText className="h-4 w-4 mr-1" /> 查看完结审阅报告
                  </Button>
                ) : volumeReviewState === 'executing_v2' || volumeReviewState === 'executing_closing' ? (
                  <Button
                    size="sm"
                    disabled={isGeneratingChapter}
                    onClick={() => {
                      setIsGeneratingChapter(true);
                      generateChapterMutation.mutate();
                    }}
                  >
                    {isGeneratingChapter ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 生成下一章</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-1" /> 生成下一章</>
                    )}
                  </Button>
                ) : chapters.length >= totalChapters && volumeReviewState === 'pending_review' ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      setShowVolumeReviewSheet(true);
                    }}
                  >
                    <FileText className="h-4 w-4 mr-1" /> 查看审阅报告
                  </Button>
                ) : chapters.length >= totalChapters ? (
                  <Button
                    size="sm"
                    disabled={isGeneratingChapter}
                    onClick={() => {
                      setIsGeneratingChapter(true);
                      generateChapterMutation.mutate();
                    }}
                  >
                    {isGeneratingChapter ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 审阅中...</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-1" /> 完成第一卷，开始审阅</>
                    )}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={isGeneratingChapter || qualityCheckBlocked}
                    onClick={() => {
                      setIsGeneratingChapter(true);
                      generateChapterMutation.mutate();
                    }}
                  >
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
                  <SheetDescription>
                    AI 已完成阶段性质量审查，请阅读报告后确认继续。
                  </SheetDescription>
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
                      {/* Full report text */}
                      <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed mb-4">
                        {qualityReport}
                      </pre>

                      {/* Revisions diff section */}
                      {qualityRevisions.length > 0 && (
                        <div className="mb-4 space-y-4">
                          <h4 className="font-semibold text-sm flex items-center gap-1.5">
                            <FileText className="h-4 w-4" />
                            差异对比（{qualityRevisions.length} 章建议修改）
                          </h4>
                          {qualityRevisions.map((rev) => {
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
                    <Button
                      variant="outline"
                      onClick={() => {
                        setQualityCheckBlocked(false);
                      }}
                      disabled={isAnalyzingChapters}
                    >
                      忽略，继续
                    </Button>
                    <Button
                      onClick={async () => {
                        if (qualityRevisions.length > 0) {
                          // Apply revisions to chapters
                          const updatedChapters = chapters.map((ch, i) => {
                            const rev = qualityRevisions.find((r) => r.chapter_index === i);
                            return rev ? { title: ch.title, content: rev.content } : ch;
                          });
                          setChapters(updatedChapters);

                          // Update novelContent for backward compatibility
                          const fullText = updatedChapters.map(
                            (ch) => `# ${ch.title}\n\n${ch.content}`
                          ).join('\n\n---\n\n');
                          setNovelContent(fullText);

                          // Persist to draft
                          await saveDraft('generate', {
                            chapters: updatedChapters,
                            novelContent: fullText,
                            qualityReport,
                            qualityRevisions,
                            qualityRevisionsSummary,
                          });
                        } else {
                          await saveDraft('generate', { qualityReport });
                        }
                        setQualityCheckBlocked(false);
                        toast({ title: '修改已应用', description: `已更新 ${qualityRevisions.length} 章内容。` });
                      }}
                      disabled={isAnalyzingChapters}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" /> 应用修改
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            {/* ── Volume 1 review sheet (30 chapters done) ── */}
            <Sheet open={showVolumeReviewSheet} onOpenChange={(open) => {
              if (!open && !isSubmittingDecision) {
                setShowVolumeReviewSheet(false);
              }
            }}>
              <SheetContent side="right" className="w-full sm:max-w-xl md:max-w-2xl">
                <SheetHeader>
                  <SheetTitle>第一卷完成审阅报告</SheetTitle>
                  <SheetDescription>
                    AI 已审阅全部 {chapters.length} 章，以下是分析报告和后续建议。
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-4 flex flex-col h-[calc(100vh-12rem)]">
                  <ScrollArea className="flex-1 pr-4">
                    {volumeReviewReport && (
                      <>
                        {/* Review text */}
                        <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed mb-6">
                          {volumeReviewReport.review_text}
                        </pre>

                        {/* Analysis summary */}
                        {volumeReviewReport.analysis_summary && (
                          <div className="mb-6 p-4 bg-muted rounded-lg">
                            <h4 className="font-semibold text-sm mb-2">故事状态分析</h4>
                            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
                              {volumeReviewReport.analysis_summary}
                            </pre>
                          </div>
                        )}

                        {/* LLM Recommended Decision */}
                        <div className="mb-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                          <p className="text-sm font-medium">
                            AI 推荐：<span className="text-primary">{volumeReviewReport.parsed_decision}</span>
                          </p>
                        </div>
                      </>
                    )}

                    {/* Volume 2 outline preview */}
                    {volume2Outline && (
                      <div className="mb-6">
                        <h4 className="font-semibold text-sm mb-2">第二卷细纲预览</h4>
                        <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed bg-muted p-3 rounded-lg max-h-40 overflow-y-auto">
                          {volume2Outline}
                        </pre>
                      </div>
                    )}

                    {/* ── Revised chapters diff (from volume review) ── */}
                    {volumeReviewData && (() => {
                      const revisedChapters: any[] | null | undefined = volumeReviewData.revised_chapters;
                      if (!revisedChapters || revisedChapters.length === 0) return null;
                      return (
                        <div className="mb-6 space-y-4">
                          <h4 className="font-semibold text-sm flex items-center gap-1.5">
                            <FileText className="h-4 w-4" />
                            差异对比（{revisedChapters.length} 章建议修改）
                          </h4>
                          {revisedChapters.map((rev: any) => {
                            const origChapter = chapters[rev.chapter_index as number];
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
                      );
                    })()}

                    {/* Decision options */}
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

                    {/* Apply revisions toggle */}
                    {volumeReviewData && (() => {
                      const revisedChapters: any[] | null | undefined = volumeReviewData.revised_chapters;
                      if (!revisedChapters || revisedChapters.length === 0) return null;
                      return (
                        <div className="flex items-center gap-2 pb-4">
                          <input
                            type="checkbox"
                            id="apply-revisions"
                            checked={applyVolumeRevisions}
                            onChange={(e) => setApplyVolumeRevisions(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <label htmlFor="apply-revisions" className="text-sm">
                            应用以上 {revisedChapters.length} 章修改建议
                          </label>
                        </div>
                      );
                    })()}
                  </ScrollArea>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t mt-4">
                    <Button
                      variant="outline"
                      onClick={() => setShowVolumeReviewSheet(false)}
                      disabled={isSubmittingDecision}
                    >
                      稍后决定
                    </Button>
                    <Button
                      onClick={() => {
                        if (!selectedVolumeDecision) return;
                        setIsSubmittingDecision(true);
                        submitDecisionMutation.mutate(selectedVolumeDecision);
                      }}
                      disabled={!selectedVolumeDecision || isSubmittingDecision}
                    >
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

            {/* ── Final novel review sheet (v2/closing arc completed) ── */}
            <Sheet open={showFinalReviewSheet} onOpenChange={(open) => {
              if (!open && !isSubmittingFinalDecision) {
                setShowFinalReviewSheet(false);
              }
            }}>
              <SheetContent side="right" className="w-full sm:max-w-xl md:max-w-2xl">
                <SheetHeader>
                  <SheetTitle>小说完结综合审阅报告</SheetTitle>
                  <SheetDescription>
                    AI 已审阅全部 {chapters.length} 章内容，这是全书最终检查报告。
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-4 flex flex-col h-[calc(100vh-12rem)]">
                  <ScrollArea className="flex-1 pr-4">
                    {finalReviewData && (
                      <>
                        <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed mb-6">
                          {finalReviewData.report}
                        </pre>

                        {/* Revised chapters diff */}
                        {(() => {
                          const revisedChapters: any[] | null | undefined = finalReviewData.revised_chapters;
                          if (!revisedChapters || revisedChapters.length === 0) return null;
                          return (
                            <div className="mb-6 space-y-4">
                              <h4 className="font-semibold text-sm flex items-center gap-1.5">
                                <FileText className="h-4 w-4" />
                                差异对比（{revisedChapters.length} 章建议修改）
                              </h4>
                              {revisedChapters.map((rev: any) => {
                                const origChapter = chapters[rev.chapter_index as number];
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
                          );
                        })()}

                        <Separator className="my-4" />

                        {/* Complete novel section */}
                        <div className="mb-4 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                          <h4 className="font-semibold text-sm flex items-center gap-1.5 mb-2">
                            <BookOpen className="h-4 w-4 text-green-600" />
                            小说完结确认
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            阅读以上审阅报告后，你可以选择应用修改建议，然后完成整篇小说。
                            完结后小说将标记为已完成状态。
                          </p>
                        </div>
                      </>
                    )}
                  </ScrollArea>

                  <div className="flex items-center justify-between gap-3 pt-4 border-t mt-4">
                    <div className="flex items-center gap-2">
                      {finalReviewData && (() => {
                        const revisedChapters: any[] | null | undefined = finalReviewData.revised_chapters;
                        if (!revisedChapters || revisedChapters.length === 0) return null;
                        return (
                          <>
                            <input
                              type="checkbox"
                              id="apply-final-revisions"
                              checked={applyFinalRevisions}
                              onChange={(e) => setApplyFinalRevisions(e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            <label htmlFor="apply-final-revisions" className="text-sm">
                              应用 {revisedChapters.length} 章修改建议
                            </label>
                          </>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setShowFinalReviewSheet(false)}
                        disabled={isSubmittingFinalDecision}
                      >
                        稍后决定
                      </Button>
                      <Button
                        onClick={() => {
                          setIsSubmittingFinalDecision(true);
                          submitFinalDecisionMutation.mutate();
                        }}
                        disabled={isSubmittingFinalDecision}
                      >
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
          /* ── Batch mode (existing polling-based flow) ── */
          <>
            {novelContent ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold tracking-tight">生成的小说</h2>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveTab('rules')}
                    >
                      返回守则
                    </Button>
                    {novelPollingTaskId && (
                      <Button
                        size="sm"
                        onClick={() => router.push(`/task/${novelPollingTaskId}`)}
                      >
                        查看结果
                      </Button>
                    )}
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
                {novelPollingTaskId && (
                  <div className="flex justify-center">
                    <Button
                      onClick={() => router.push(`/task/${novelPollingTaskId}`)}
                    >
                      查看完整结果
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 space-y-4">
                {isNovelPending ? (
                  <>
                    <Loader2 className="h-12 w-12 mx-auto animate-spin text-muted-foreground/60" />
                    <p className="text-muted-foreground">小说生成中，请稍候...</p>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground/40" />
                    <p className="text-muted-foreground">尚未生成小说。</p>
                    <Button variant="outline" onClick={() => setActiveTab('rules')}>
                      前往守则确认
                    </Button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </TabsContent>
    </Tabs>
    </div>
  );
}

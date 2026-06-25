'use client';

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { draftsApi } from '@/services/drafts';
import { promptsApi } from '@/services/prompts';
import { useWorkflowStore } from '@/stores/workflow-store';
import { toast } from '@/hooks/use-toast';
import type { ChapterRevision } from '@/types/draft';
import type { GenerateChapterResp } from '@/types/draft';

export interface UseInteractiveGenerationOptions {
  draftId: string | null;
  genModel: string;
  saveDraft: (step: string, overrides?: Record<string, any>, completed?: boolean) => Promise<void>;
}

export function useInteractiveGeneration({ draftId, genModel, saveDraft }: UseInteractiveGenerationOptions) {
  const setNovelContent = useWorkflowStore((s) => s.setNovelContent);

  // Chapter state
  const [chapters, setChapters] = useState<{ title: string; content: string }[]>([]);
  const [totalChapters, setTotalChapters] = useState(30);
  const [generateMode, setGenerateMode] = useState<'batch' | 'interactive' | null>(null);
  const [isGeneratingChapter, setIsGeneratingChapter] = useState(false);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);

  // Quality check state
  const [qualityReport, setQualityReport] = useState<string | null>(null);
  const [qualityRevisions, setQualityRevisions] = useState<ChapterRevision[]>([]);
  const [qualityRevisionsSummary, setQualityRevisionsSummary] = useState<string>('');
  const [isAnalyzingChapters, setIsAnalyzingChapters] = useState(false);
  const [qualityCheckBlocked, setQualityCheckBlocked] = useState(false);

  // Volume review state
  const [volumeReviewState, setVolumeReviewState] = useState<string | null>(null);
  const [volumeReviewReport, setVolumeReviewReport] = useState<any>(null);
  const [volumeReviewData, setVolumeReviewData] = useState<any>(null);
  const [volumeReviewDecision, setVolumeReviewDecision] = useState<string | null>(null);
  const [volume2Outline, setVolume2Outline] = useState<string | null>(null);
  const [showVolumeReviewSheet, setShowVolumeReviewSheet] = useState(false);
  const [selectedVolumeDecision, setSelectedVolumeDecision] = useState<string | null>(null);
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [applyVolumeRevisions, setApplyVolumeRevisions] = useState(false);

  // Final review state
  const [finalReviewData, setFinalReviewData] = useState<any>(null);
  const [showFinalReviewSheet, setShowFinalReviewSheet] = useState(false);
  const [isSubmittingFinalDecision, setIsSubmittingFinalDecision] = useState(false);
  const [applyFinalRevisions, setApplyFinalRevisions] = useState(false);

  // ── Helper: set interactive generation state from restored draft ──
  const restoreInteractiveState = useCallback((sd: any) => {
    if (sd.chapters) setChapters(sd.chapters);
    if (sd.totalChapters) setTotalChapters(sd.totalChapters);
    if (sd.generateMode) setGenerateMode(sd.generateMode as 'batch' | 'interactive');
    if (sd.qualityReport !== undefined) setQualityReport(sd.qualityReport);
    if (sd.qualityRevisions) setQualityRevisions(sd.qualityRevisions);
    if (sd.qualityRevisionsSummary) setQualityRevisionsSummary(sd.qualityRevisionsSummary);
    if (sd.volumeReviewState) setVolumeReviewState(sd.volumeReviewState);
    if (sd.volumeReviewReport) setVolumeReviewReport(sd.volumeReviewReport);
    if (sd.volumeReviewDecision) setVolumeReviewDecision(sd.volumeReviewDecision);
    if (sd.volume2Outline) setVolume2Outline(sd.volume2Outline);
    if (sd.finalReviewReport) setFinalReviewData((prev: any) => ({ ...prev, report: sd.finalReviewReport }));
    if (sd.finalReviewRevisions) setFinalReviewData((prev: any) => ({ ...prev, revised_chapters: sd.finalReviewRevisions }));
    if (sd.volumeReviewState === 'pending_review') setShowVolumeReviewSheet(true);
    if (sd.volumeReviewState === 'pending_final_review') setShowFinalReviewSheet(true);
  }, []);

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

  // ── Interactive chapter generation mutation ──
  const generateChapterMutation = useMutation({
    mutationFn: async () => {
      const { data } = await draftsApi.generateChapter(draftId!, {
        gen_model: genModel || undefined,
      });
      return data;
    },
    onSuccess: (data: GenerateChapterResp) => {
      // Volume review (30 chapters done)
      if (data.volume_review) {
        const volReview = data.volume_review;
        setVolumeReviewReport(volReview.volume_review_report);
        setVolumeReviewData(volReview);
        setVolume2Outline(volReview.volume_2_outline ?? null);
        setSelectedVolumeDecision(volReview.volume_review_report.parsed_decision);
        setVolumeReviewState('pending_review');
        setShowVolumeReviewSheet(true);
        setIsGeneratingChapter(false);
        saveDraft('generate', {
          volumeReviewState: 'pending_review',
          volumeReviewReport: volReview.volume_review_report,
          volume2Outline: volReview.volume_2_outline ?? undefined,
        });
        return;
      }

      // Final novel review (v2/closing arc completed)
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

      // Normal chapter generation
      const updatedChapters = (data.draft.step_data.chapters ?? []) as { title: string; content: string }[];
      setChapters(updatedChapters);
      setTotalChapters(data.total_chapters);
      setSelectedChapterIndex(data.chapter_num - 1);
      setIsGeneratingChapter(false);
      const fullText = updatedChapters.map(
        (ch: { title: string; content: string }) => `# ${ch.title}\n\n${ch.content}`
      ).join('\n\n---\n\n');
      setNovelContent(fullText);
      if (data.quality_check_needed) {
        setQualityCheckBlocked(true);
        setIsAnalyzingChapters(true);
        analyzeChaptersMutation.mutate(updatedChapters);
      }
    },
    onError: (err) => {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      toast({ title: '章节生成失败', description: e.response?.data?.detail || e.message, variant: 'destructive' });
      setIsGeneratingChapter(false);
    },
  });

  // ── Volume review decision mutation ──
  const submitDecisionMutation = useMutation({
    mutationFn: async (decision: string) => {
      const { data } = await draftsApi.submitVolumeDecision(draftId!, {
        decision: decision as any,
        apply_revisions: applyVolumeRevisions,
      });
      return data;
    },
    onSuccess: (data: any) => {
      setShowVolumeReviewSheet(false);
      setIsSubmittingDecision(false);
      setVolumeReviewDecision(selectedVolumeDecision);

      if ('chapter_num' in data && data.chapter_num) {
        const ch = data;
        const newChapter = { title: ch.chapter_title, content: ch.chapter_content };
        setChapters((prev) => [...prev, newChapter]);
        setTotalChapters(ch.total_chapters);
        setSelectedChapterIndex(ch.chapter_num - 1);
        const reviewState = ch.chapter_num >= 31 && ch.chapter_num <= 40 ? 'executing_v2' : 'executing_closing';
        setVolumeReviewState(reviewState);
        saveDraft('generate', {
          volumeReviewState: reviewState,
          volumeReviewDecision: selectedVolumeDecision!,
          totalChapters: ch.total_chapters,
        });
      } else {
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

  // ── Apply quality revisions ──
  const applyQualityRevisions = useCallback(async () => {
    if (qualityRevisions.length > 0) {
      const updatedChapters = chapters.map((ch, i) => {
        const rev = qualityRevisions.find((r) => r.chapter_index === i);
        return rev ? { title: ch.title, content: rev.content } : ch;
      });
      setChapters(updatedChapters);

      const fullText = updatedChapters.map(
        (ch) => `# ${ch.title}\n\n${ch.content}`
      ).join('\n\n---\n\n');
      setNovelContent(fullText);

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
  }, [chapters, qualityRevisions, qualityReport, qualityRevisionsSummary, saveDraft, setNovelContent]);

  const handleGenerateChapter = useCallback(() => {
    setIsGeneratingChapter(true);
    generateChapterMutation.mutate();
  }, [generateChapterMutation]);

  const submitDecision = useCallback((decision: string) => {
    setIsSubmittingDecision(true);
    submitDecisionMutation.mutate(decision);
  }, [submitDecisionMutation]);

  const submitFinalDecision = useCallback(() => {
    setIsSubmittingFinalDecision(true);
    submitFinalDecisionMutation.mutate();
  }, [submitFinalDecisionMutation]);

  return {
    // State
    chapters, setChapters,
    totalChapters, setTotalChapters,
    generateMode, setGenerateMode,
    isGeneratingChapter,
    selectedChapterIndex, setSelectedChapterIndex,

    qualityReport, qualityRevisions, qualityRevisionsSummary,
    isAnalyzingChapters, qualityCheckBlocked, setQualityCheckBlocked,

    volumeReviewState, setVolumeReviewState,
    volumeReviewReport, volumeReviewData,
    volumeReviewDecision, volume2Outline,
    showVolumeReviewSheet, setShowVolumeReviewSheet,
    selectedVolumeDecision, setSelectedVolumeDecision,
    isSubmittingDecision, applyVolumeRevisions, setApplyVolumeRevisions,

    finalReviewData, setFinalReviewData,
    showFinalReviewSheet, setShowFinalReviewSheet,
    isSubmittingFinalDecision, applyFinalRevisions, setApplyFinalRevisions,

    // Actions
    handleGenerateChapter,
    applyQualityRevisions,
    submitDecision,
    submitFinalDecision,

    // Internal state restoration (used by useDraftPersistence)
    restoreInteractiveState,
  };
}

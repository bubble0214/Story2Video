'use client';

import { useState, useCallback, useRef, useEffect, Fragment } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, FileText, CheckCircle2, ChevronRight, BookOpen, LayoutTemplate, ListOrdered, Stethoscope, AlertTriangle, AlertCircle, PauseCircle, RefreshCw, RotateCcw, X, Eye, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import type { TaskResp } from '@/types/task';
import type { ParsedSceneItem } from '@/types/draft';
import { draftsApi } from '@/services/drafts';
import type { DraftStepData } from '@/types/draft';
import { scriptsApi } from '@/services/scripts';

const GENRE_OPTIONS = ['科幻', '古装', '悬疑', '爱情', '奇幻', '战争', '文艺', '喜剧', '恐怖'];
const FORMAT_OPTIONS = ['电影', '剧集'];
const TONE_OPTIONS = ['紧张', '温暖', '冷峻', '幽默', '悲壮', '轻快', '深沉'];

const SCRIPT_TABS = [
  { value: 'novel_analysis', label: '核心要素提取', icon: BookOpen },
  { value: 'scene_outline', label: '分场大纲', icon: LayoutTemplate },
  { value: 'generate', label: '剧本生成', icon: CheckCircle2 },
  { value: 'diagnosis', label: '剧本诊断', icon: Stethoscope },
];
const TAB_ORDER = ['novel_analysis', 'scene_outline', 'generate', 'diagnosis'];

function buildCharacterPrompt(genre: string, format: string, tone: string): string {
  const parts: string[] = [];
  parts.push('你现在是一位资深影视编剧，擅长将文学作品转化为视觉性极强的电影剧本。');
  parts.push('接下来，我将分阶段提供一部小说，请你协助我完成剧本改编。');
  parts.push(`我们的目标是创作一部${genre || '（待定）'}风格的${format || '（待定）'}，整体基调${tone || '（待定）'}。`);
  parts.push('在每次回复前，请先以编剧思维分析我的需求，再给出内容。');
  return parts.join('\n');
}

const STORYBOARD_STYLE_MAP: Record<string, string> = {
  '真人': '真人实拍电影风格，写实光影，自然色彩，真实人物动作逻辑',
  '2D': '2D动漫风格，手绘质感，平涂色彩，日系或国漫画风',
  '3D': '3D动画渲染风格，立体建模，CG光影，风格化材质',
};

const ANALYSIS_SYSTEM_PROMPT =
  '请仔细阅读以上小说章节。作为编剧，请你完成以下分析：\n\n' +
  '1. 用一段话概括核心故事（一句话梗概Logline）。\n\n' +
  '2. 列出主要人物小传（每人一句话，标明其戏剧性欲望和致命缺陷）。\n\n' +
  '3. 标出3-5个最震撼、必须保留的\'名场面\'。\n\n' +
  '4. 指出原著中可能不适合影视化呈现的部分（如大量内心独白），并给出改编建议。\n\n' +
  '5. 为这个剧本取一个名字，输出格式为【剧本名称】：你的命名';

export function ScriptPage({ initialDraftId }: { initialDraftId?: string }) {
  const router = useRouter();

  // ── Store ──
  const characterSettings = useWorkflowStore((s) => s.characterSettings);
  const setCharacterSettings = useWorkflowStore((s) => s.setCharacterSettings);
  const novelContent = useWorkflowStore((s) => s.novelContent);
  const setNovelContent = useWorkflowStore((s) => s.setNovelContent);
  const resetWorkflow = useWorkflowStore((s) => s.reset);

  // Reset store on mount for a clean slate (matching novel workflow behavior)
  const resetDoneRef = useRef(false);
  useEffect(() => {
    if (resetDoneRef.current) return;
    resetDoneRef.current = true;
    resetWorkflow();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Local state ──
  const [activeTab, setActiveTab] = useState('novel_analysis');
  const [genModel, setGenModel] = useState('');
  const [extraPrompt, setExtraPrompt] = useState('');
  const [novelAnalysis, setNovelAnalysis] = useState<string | null>(null);
  const [analysisTaskId, setAnalysisTaskId] = useState<string | null>(null);
  const [scriptTaskId, setScriptTaskId] = useState<string | null>(null);
  const [structureContent, setStructureContent] = useState<string | null>(null);
  const [chosenStructure, setChosenStructure] = useState<'A' | 'B' | null>(null);
  const [structureTaskId, setStructureTaskId] = useState<string | null>(null);
  const [sceneOutlineContent, setSceneOutlineContent] = useState<string | null>(null);
  const [sceneOutlineTaskId, setSceneOutlineTaskId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [assetPopoverOpen, setAssetPopoverOpen] = useState(false);
  const [charAddPopoverOpen, setCharAddPopoverOpen] = useState(false);
  const [editableAnalysisPrompt, setEditableAnalysisPrompt] = useState(ANALYSIS_SYSTEM_PROMPT);
  const [scriptTitle, setScriptTitle] = useState<string | null>(null);

  // ── Interactive script generation state ──
  const [parsedScenes, setParsedScenes] = useState<ParsedSceneItem[]>([]);
  const [generatedScenes, setGeneratedScenes] = useState<Record<number, string>>({});
  const [accumulatedScript, setAccumulatedScript] = useState('');
  const [currentSceneIdx, setCurrentSceneIdx] = useState(0);
  const [pendingSceneIdx, setPendingSceneIdx] = useState<number | null>(null);
  const [lastDiagnosedIdx, setLastDiagnosedIdx] = useState(-1);
  const [sceneTaskId, setSceneTaskId] = useState<string | null>(null);
  const [diagnosisTaskId, setDiagnosisTaskId] = useState<string | null>(null);
  const [diagnosisResult, setDiagnosisResult] = useState<string | null>(null);
  const [diagnosisModifiedScenes, setDiagnosisModifiedScenes] = useState<Record<string, string> | null>(null);
  const [isApplyingDiagnosis, setIsApplyingDiagnosis] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [interactiveScriptDone, setInteractiveScriptDone] = useState(false);
  const [finalDiagnosisDone, setFinalDiagnosisDone] = useState(false);
  const [periodicDiagnosisTaskId, setPeriodicDiagnosisTaskId] = useState<string | null>(null);
  const [frequentDiagnosisResult, setFrequentDiagnosisResult] = useState<{
    diagnosis: string;
    modifiedScenes: Record<string, string> | null;
    sceneCount: number;
  } | null>(null);
  const scenesInitializedRef = useRef(false);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState<number | null>(null);
  const [editingSceneContent, setEditingSceneContent] = useState('');

  // ── Storyboard state ──
  const [sceneStoryboards, setSceneStoryboards] = useState<Record<number, string>>({});
  const [storyboardStyle, setStoryboardStyle] = useState<string>('');
  const [storyboardEnabled, setStoryboardEnabled] = useState(true);
  const [activeSceneView, setActiveSceneView] = useState<'script' | 'storyboard' | 'character_prompt' | 'scene_prompt' | 'prop_prompt'>('script');
  const [sceneCharacterPrompts, setSceneCharacterPrompts] = useState<Record<number, string>>({});
  const [sceneScenePrompts, setSceneScenePrompts] = useState<Record<number, string>>({});
  const [scenePropPrompts, setScenePropPrompts] = useState<Record<number, string>>({});

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
  const hasStructure = structureContent !== null && chosenStructure !== null;
  const hasSceneOutline = sceneOutlineContent !== null;

  const isReachable = (tab: string) => {
    if (tab === 'novel_analysis') return true;
    if (tab === 'scene_outline') return hasRoleSettings && hasNovelSource && hasAnalysis;
    if (tab === 'generate') return hasRoleSettings && hasNovelSource && hasAnalysis && hasStructure && hasSceneOutline;
    if (tab === 'diagnosis') return hasRoleSettings && hasNovelSource && hasAnalysis && hasStructure && hasSceneOutline && completedCount >= parsedScenes.length && parsedScenes.length > 0;
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
        if (sd.scriptTitle) setScriptTitle(sd.scriptTitle as string);
        if (sd.structureContent) setStructureContent(sd.structureContent as string);
        if (sd.chosenStructure) setChosenStructure(sd.chosenStructure as 'A' | 'B');
        if (sd.sceneOutlineContent) setSceneOutlineContent(sd.sceneOutlineContent as string);
        if (sd.parsedScenes) {
          const savedGenerated = sd.generatedScenes as Record<number, string> | undefined;
          // Normalize `generating` scenes on reload: no polling can resume because
          // sceneTaskId is not persisted. If the scene already has content, mark it
          // completed; otherwise reset to pending so the user can re-generate.
          const normalized: ParsedSceneItem[] = (sd.parsedScenes as ParsedSceneItem[]).map(s =>
            s.status === 'generating'
              ? { ...s, status: (savedGenerated?.[s.index]?.trim() ? 'completed' as const : 'pending' as const) }
              : s,
          );
          setParsedScenes(normalized);
        }
        if (sd.generatedScenes) setGeneratedScenes(sd.generatedScenes as Record<number, string>);
        if (sd.sceneStoryboards) setSceneStoryboards(sd.sceneStoryboards as Record<number, string>);
        if (sd.sceneCharacterPrompts) setSceneCharacterPrompts(sd.sceneCharacterPrompts as Record<number, string>);
        if (sd.sceneScenePrompts) setSceneScenePrompts(sd.sceneScenePrompts as Record<number, string>);
        if (sd.scenePropPrompts) setScenePropPrompts(sd.scenePropPrompts as Record<number, string>);
        if (sd.accumulatedScript) setAccumulatedScript(sd.accumulatedScript as string);
        if (typeof sd.currentSceneIdx === 'number') setCurrentSceneIdx(sd.currentSceneIdx as number);
        if (typeof sd.lastDiagnosedIdx === 'number') setLastDiagnosedIdx(sd.lastDiagnosedIdx as number);
        // pendingSceneIdx is NOT restored — after reload, no polling can resume, so
        // generating scenes are normalized to completed/pending above instead.
        if (sd.diagnosisResult) setDiagnosisResult(sd.diagnosisResult as string);
        if (sd.finalDiagnosisDone) setFinalDiagnosisDone(sd.finalDiagnosisDone as boolean);
        if (sd.interactiveScriptDone) setInteractiveScriptDone(sd.interactiveScriptDone as boolean);
        if (sd.extraPrompt) setExtraPrompt(sd.extraPrompt as string);
        if (sd.genModel) setGenModel(sd.genModel as string);
        setActiveTab(sd.activeTab as string || 'novel_analysis');
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
            scriptTitle,
            structureContent,
            chosenStructure,
            sceneOutlineContent,
            parsedScenes,
            generatedScenes,
            sceneStoryboards,
            sceneCharacterPrompts,
            sceneScenePrompts,
            scenePropPrompts,
            accumulatedScript,
            currentSceneIdx,
            lastDiagnosedIdx,
            diagnosisResult,
            finalDiagnosisDone,
            interactiveScriptDone,
            extraPrompt,
            genModel,
            activeTab,
          };
          const { data: draft } = await draftsApi.upsert({
            workflow_type: 'script',
            title: scriptTitle || undefined,
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
        title: scriptTitle || undefined,
        status: 'in_progress',
        step_data: {
          scriptTitle,
          genre: characterSettings.genre,
          format: characterSettings.format,
          tone: characterSettings.tone,
          novelContent,
          novelAnalysis,
          structureContent,
          chosenStructure,
          sceneOutlineContent,
          parsedScenes,
          generatedScenes,
          sceneStoryboards,
          sceneCharacterPrompts,
          sceneScenePrompts,
          scenePropPrompts,
          accumulatedScript,
          currentSceneIdx,
          lastDiagnosedIdx,
          diagnosisResult,
          finalDiagnosisDone,
          interactiveScriptDone,
          extraPrompt,
          genModel,
          activeTab,
        } as unknown as DraftStepData,
      });
    } catch { /* silent */ }
  }, [activeTab, characterSettings, novelContent, novelAnalysis, scriptTitle, structureContent, chosenStructure, sceneOutlineContent, parsedScenes, generatedScenes, sceneStoryboards, sceneCharacterPrompts, sceneScenePrompts, scenePropPrompts, accumulatedScript, currentSceneIdx, lastDiagnosedIdx, diagnosisResult, interactiveScriptDone, extraPrompt, genModel]);

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
      setScriptTitle(file.name.replace(/\.txt$/i, ''));
      toast({ title: '小说上传成功', description: `已加载 ${file.name}（${(text.length / 1024).toFixed(1)} KB）` });
      setTimeout(saveImmediate, 100);
    } catch (err) {
      toast({ title: '文件读取失败', description: String(err), variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  }, [setNovelContent]);

  // ── Novel source: select from assets (tasks + drafts) ──
  const { data: assetNovelsData } = useQuery({
    queryKey: ['asset-novels'],
    queryFn: async () => {
      const [tasksResp, draftsResp] = await Promise.all([
        tasksApi.list({ workflow_type: undefined, limit: 50 }),
        draftsApi.list({ workflow_type: 'novel', limit: 50 }),
      ]);
      return { tasks: tasksResp.data, drafts: draftsResp.data };
    },
    enabled: assetPopoverOpen,
  });
  interface AssetNovelItem {
    id: string; title: string; content: string; source: 'task' | 'draft';
  }
  const assetNovels: AssetNovelItem[] = [];
  if (assetNovelsData) {
    const taskNovels: AssetNovelItem[] = (assetNovelsData.tasks?.items ?? [])
      .filter((t: TaskResp) => t.status === 'SUCCESS' && t.result?.novel_content)
      .map((t: TaskResp) => ({
        id: t.id, source: 'task' as const,
        title: (t.result?.title as string) || t.id.slice(0, 8),
        content: t.result!.novel_content as string,
      }));
    assetNovels.push(...taskNovels);
    const draftNovels: AssetNovelItem[] = assetNovelsData.drafts
      .filter((d) => d.status === 'completed')
      .map((d) => ({ id: d.id, source: 'draft' as const, title: d.title, content: '' }));
    assetNovels.push(...draftNovels);
  }

  const handleSelectAssetNovel = useCallback(async (item: AssetNovelItem) => {
    let content = item.content;
    if (!content && item.source === 'draft') {
      try {
        const { data: draft } = await draftsApi.get(item.id);
        content = (draft.step_data as DraftStepData)?.novelContent || '';
      } catch { /* ignore */ }
    }
    if (content) {
      setNovelContent(content);
      setNovelAnalysis(null);
      setScriptTitle(item.title);
      toast({ title: '已加载小说', description: item.title });
    } else {
      toast({ title: '加载失败', description: '该小说内容不可用', variant: 'destructive' });
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
        const analysis = result.novel_analysis as string;
        setNovelAnalysis(analysis);
        setAnalysisTaskId(null);
        setAnalysisTaskId(null);
        toast({ title: '核心要素提取完成' });
      }
    } else if (polledAnalysis.status === 'FAILED') {
      setAnalysisTaskId(null);
      toast({ title: '分析失败', description: polledAnalysis.error_message || '未知错误', variant: 'destructive' });
    }
  }, [polledAnalysis]);

  // ── Structure generation polling ──
  const { data: polledStructure } = useQuery({
    queryKey: ['task', structureTaskId],
    queryFn: async () => {
      const { data } = await tasksApi.get(structureTaskId!);
      return data;
    },
    enabled: !!structureTaskId,
    refetchInterval: (query) => {
      const state = query.state.data;
      if (!state) return 1000;
      if (state.status === 'SUCCESS' || state.status === 'FAILED') return false;
      return 1000;
    },
  });

  useEffect(() => {
    if (!polledStructure) return;
    if (polledStructure.status === 'SUCCESS') {
      const result = polledStructure.result;
      if (result.structure_content) {
        setStructureContent(result.structure_content as string);
        setStructureTaskId(null);
        toast({ title: '结构方案生成完成' });
      }
    } else if (polledStructure.status === 'FAILED') {
      setStructureTaskId(null);
      toast({ title: '结构生成失败', description: polledStructure.error_message || '未知错误', variant: 'destructive' });
    }
  }, [polledStructure]);

  // ── Scene outline polling ──
  const { data: polledSceneOutline } = useQuery({
    queryKey: ['task', sceneOutlineTaskId],
    queryFn: async () => {
      const { data } = await tasksApi.get(sceneOutlineTaskId!);
      return data;
    },
    enabled: !!sceneOutlineTaskId,
    refetchInterval: (query) => {
      const state = query.state.data;
      if (!state) return 1000;
      if (state.status === 'SUCCESS' || state.status === 'FAILED') return false;
      return 1000;
    },
  });

  useEffect(() => {
    if (!polledSceneOutline) return;
    if (polledSceneOutline.status === 'SUCCESS') {
      const result = polledSceneOutline.result;
      if (result.scene_outline_content) {
        setSceneOutlineContent(result.scene_outline_content as string);
        setSceneOutlineTaskId(null);
        toast({ title: '分场大纲生成完成' });
      }
    } else if (polledSceneOutline.status === 'FAILED') {
      setSceneOutlineTaskId(null);
      toast({ title: '分场大纲生成失败', description: polledSceneOutline.error_message || '未知错误', variant: 'destructive' });
    }
  }, [polledSceneOutline]);

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
        window.location.href = `/result-view/script/${scriptTaskId}`;
      }
    } else if (polledScript.status === 'FAILED') {
      setScriptTaskId(null);
      toast({ title: '剧本生成失败', description: polledScript.error_message || '未知错误', variant: 'destructive' });
    }
  }, [polledScript, scriptTaskId, router]);

  // ── Parse scenes from outline when entering generate tab ──
  const prevOutlineRef = useRef<string | null>(null);
  useEffect(() => {
    if (!sceneOutlineContent) return;
    // Detect re-generation: outline content changed
    const isRegen = prevOutlineRef.current !== null && prevOutlineRef.current !== sceneOutlineContent;
    if (isRegen) {
      setParsedScenes([]);
      setGeneratedScenes({});
      setAccumulatedScript('');
      setCurrentSceneIdx(0);
      setSelectedSceneIndex(null);
      setInteractiveScriptDone(false);
      setFinalDiagnosisDone(false);
      scenesInitializedRef.current = false;
    }
    prevOutlineRef.current = sceneOutlineContent;
    if (!isRegen && (parsedScenes.length > 0 || scenesInitializedRef.current)) return;
    scenesInitializedRef.current = true;

    // Strip markdown code fences if present
    let text = sceneOutlineContent;
    text = text.replace(/```[\w]*\n/g, '').replace(/```/g, '');

    // Strip content before the scene list — start from **场号：1** or similar
    const sceneStart = text.match(/\*{0,2}场号\s*[：:]\s*1\s*\*{0,2}/);
    if (sceneStart) {
      text = text.substring(sceneStart.index!);
    }

    // Split on --- separators
    const rawScenes = text.split(/---+/).filter(s => s.trim());
    const scenes: ParsedSceneItem[] = rawScenes.map((raw, idx) => {
      const lines = raw.trim().split('\n');
      let num = '', location = '', scene_type = '', summary = '', characters = '';

      // Multi-line fallback: if no structured fields found, try to use first meaningful line as summary
      let foundStructured = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('---')) continue;

        // Try to find key: value pattern with Chinese or ASCII colon
        const cnColon = trimmed.indexOf('：');
        const asColon = trimmed.indexOf(':');
        const colonIdx = cnColon > -1 ? cnColon : (asColon > -1 ? asColon : -1);

        if (colonIdx > 0 && colonIdx < 15) {
          const key = trimmed.substring(0, colonIdx).trim();
          const val = trimmed.substring(colonIdx + 1).trim();
          if (!val) continue;

          if (key === '场号' || key === '场次') {
            // If the parsed number is "0", it's likely 0-indexed — force 1-based
            num = (val === '0' || val === '0.') ? String(idx + 1) : val;
            foundStructured = true;
          } else if (key === '地点') {
            location = val;
            foundStructured = true;
          } else if (key === '场景类型' || key === '内外') {
            scene_type = val;
            foundStructured = true;
          } else if (key === '时间') {
            if (!location) location = val;
            else location = `${location} - ${val}`;
            foundStructured = true;
          } else if (key === '梗概' || key.includes('梗概')) {
            summary = val;
            foundStructured = true;
          } else if (key === '人物' || key.includes('人物')) {
            characters = val;
            foundStructured = true;
          }
        }
      }

      // Fallback: if no structured fields, use the entire first sentence/line as summary
      if (!foundStructured) {
        summary = lines.map(l => l.trim()).filter(l => l && !l.startsWith('---'))[0] || '';
        // Truncate long summaries
        if (summary.length > 100) summary = summary.substring(0, 100) + '…';
      }

      return { index: idx, num: num || String(idx + 1), location, scene_type, summary, characters, raw: raw.trim(), status: 'pending' as const };
    });
    setParsedScenes(scenes.length > 0 ? scenes : []);
  }, [sceneOutlineContent]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Single scene polling ──
  const { data: polledScene } = useQuery({
    queryKey: ['task', sceneTaskId],
    queryFn: async () => {
      const { data } = await tasksApi.get(sceneTaskId!);
      return data;
    },
    enabled: !!sceneTaskId,
    refetchInterval: (query) => {
      const state = query.state.data;
      if (!state) return 1000;
      if (state.status === 'SUCCESS' || state.status === 'FAILED') return false;
      return 1000;
    },
  });

  // Handle single scene completion
  useEffect(() => {
    if (!polledScene || !sceneTaskId) return;
    if (polledScene.status === 'SUCCESS') {
      const result = polledScene.result;
      const sceneContent = result.scene_content as string | undefined;
      const sceneIndex = result.scene_index as number | undefined;
      if (sceneIndex !== undefined) {
        const finalContent = (sceneContent || '').trim() || `（第${sceneIndex + 1}场内容为空）`;
        setGeneratedScenes(prev => ({ ...prev, [sceneIndex]: finalContent }));
        // Save storyboard if returned
        const storyboardContent = result.storyboard_content as string | undefined;
        if (storyboardContent) {
          setSceneStoryboards(prev => ({ ...prev, [sceneIndex]: storyboardContent }));
        }
        const characterPrompts = result.character_prompts as string | undefined;
        if (characterPrompts) {
          setSceneCharacterPrompts(prev => ({ ...prev, [sceneIndex]: characterPrompts }));
        }
        const scenePrompts = result.scene_prompts as string | undefined;
        if (scenePrompts) {
          setSceneScenePrompts(prev => ({ ...prev, [sceneIndex]: scenePrompts }));
        }
        const propPrompts = result.prop_prompts as string | undefined;
        if (propPrompts) {
          setScenePropPrompts(prev => ({ ...prev, [sceneIndex]: propPrompts }));
        }
        setParsedScenes(prev => prev.map(s => s.index === sceneIndex ? { ...s, status: 'completed' as const } : s));
        setAccumulatedScript(prev => prev ? `${prev}\n\n${finalContent}` : finalContent);
        setCurrentSceneIdx(sceneIndex + 1);
        setPendingSceneIdx(null);
        if (!sceneContent?.trim()) {
          toast({ title: `第${sceneIndex + 1}场生成内容为空`, variant: 'destructive' });
        }
        // Auto-save on each scene completion
        setTimeout(saveImmediate, 100);
      }
      setSceneTaskId(null);
    } else if (polledScene.status === 'FAILED') {
      const sceneIdx = pendingSceneIdx ?? (currentSceneIdx - 1);
      setParsedScenes(prev => prev.map(s => s.index === sceneIdx ? { ...s, status: 'failed' as const } : s));
      setSceneTaskId(null);
      setPendingSceneIdx(null);
      toast({ title: `第${sceneIdx + 1}场生成失败`, description: polledScene.error_message || '未知错误', variant: 'destructive' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polledScene]);

  // ── Scene diagnosis polling ──
  const { data: polledDiagnosis } = useQuery({
    queryKey: ['task', diagnosisTaskId],
    queryFn: async () => {
      const { data } = await tasksApi.get(diagnosisTaskId!);
      return data;
    },
    enabled: !!diagnosisTaskId,
    refetchInterval: (query) => {
      const state = query.state.data;
      if (!state) return 1000;
      if (state.status === 'SUCCESS' || state.status === 'FAILED') return false;
      return 1000;
    },
  });

  // Handle diagnosis completion
  useEffect(() => {
    if (!polledDiagnosis || !diagnosisTaskId) return;
    if (polledDiagnosis.status === 'SUCCESS') {
      const result = polledDiagnosis.result;
      const diagnosis = result.script_diagnosis as string | undefined;
      const modified = result.modified_scenes as Record<string, string> | undefined;
      if (diagnosis) {
        setDiagnosisResult(diagnosis);
        setDiagnosisModifiedScenes(modified || null);
      } else {
        // No diagnosis result — just mark done
        setFinalDiagnosisDone(true);
      }
      setDiagnosisTaskId(null);
    } else if (polledDiagnosis.status === 'FAILED') {
      setDiagnosisTaskId(null);
      toast({ title: '诊断失败，将跳过', description: polledDiagnosis.error_message || '未知错误', variant: 'destructive' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polledDiagnosis]);

  // ── Periodic diagnosis: every N scenes while generating ──
  const DIAGNOSIS_INTERVAL = 10;
  const completedCount = parsedScenes.filter(s => s.status === 'completed').length;
  const prevCompletedRef = useRef(0);

  // ── Periodic diagnosis polling ──
  const { data: polledPeriodicDiagnosis } = useQuery({
    queryKey: ['task', periodicDiagnosisTaskId],
    queryFn: async () => {
      const { data } = await tasksApi.get(periodicDiagnosisTaskId!);
      return data;
    },
    enabled: !!periodicDiagnosisTaskId,
    refetchInterval: (query) => {
      const state = query.state.data;
      if (!state) return 1000;
      if (state.status === 'SUCCESS' || state.status === 'FAILED') return false;
      return 1000;
    },
  });

  // Handle periodic diagnosis completion
  useEffect(() => {
    if (!polledPeriodicDiagnosis || !periodicDiagnosisTaskId) return;
    if (polledPeriodicDiagnosis.status === 'SUCCESS') {
      const result = polledPeriodicDiagnosis.result;
      const diagnosis = result.script_diagnosis as string | undefined;
      const modified = result.modified_scenes as Record<string, string> | undefined;
      if (diagnosis) {
        setFrequentDiagnosisResult({
          diagnosis,
          modifiedScenes: modified || null,
          sceneCount: completedCount,
        });
        toast({
          title: `阶段性诊断完成（前${completedCount}场）`,
          description: modified && Object.keys(modified).length > 0
            ? `发现 ${Object.keys(modified).length} 处修改建议`
            : '未发现需修改的问题',
        });
      }
      setPeriodicDiagnosisTaskId(null);
    } else if (polledPeriodicDiagnosis.status === 'FAILED') {
      setPeriodicDiagnosisTaskId(null);
      toast({ title: '阶段性诊断失败', variant: 'destructive' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polledPeriodicDiagnosis, periodicDiagnosisTaskId, completedCount]);

  // ── Periodic diagnosis: every N scenes while generating ──
  useEffect(() => {
    if (completedCount === 0) return;
    if (completedCount !== prevCompletedRef.current && completedCount > prevCompletedRef.current) {
      const prev = prevCompletedRef.current;
      prevCompletedRef.current = completedCount;

      // Check if we crossed a multiple-of-10 boundary (but NOT the final batch)
      const prevBatch = Math.floor(prev / DIAGNOSIS_INTERVAL);
      const newBatch = Math.floor(completedCount / DIAGNOSIS_INTERVAL);
      const isFinal = completedCount >= parsedScenes.length;

      if (newBatch > prevBatch && !isFinal && !periodicDiagnosisTaskId) {
        launchPeriodicDiagnosis();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedCount]);

  const launchFinalDiagnosis = useCallback(() => {
    // Gather ALL completed scenes text
    const scenesText = parsedScenes
      .filter(s => s.status === 'completed' && generatedScenes[s.index])
      .map(s => `## 场景${s.num}\n\n${generatedScenes[s.index]}`)
      .join('\n\n');
    const params: Record<string, unknown> = { scenes_text: scenesText };
    if (genModel) params.model = genModel;
    tasksApi.create({
      workflow_type: 'generate_scene_diagnosis',
      input_params: params,
    }).then(({ data }) => {
      setDiagnosisTaskId(data.id);
    }).catch(() => {
      toast({ title: '启动全剧诊断失败', variant: 'destructive' });
    });
  }, [parsedScenes, generatedScenes, genModel]);

  const launchPeriodicDiagnosis = useCallback(() => {
    const batchEnd = completedCount;
    const batchStart = Math.max(0, batchEnd - DIAGNOSIS_INTERVAL);
    const scenesText = parsedScenes
      .filter(s => s.status === 'completed' && generatedScenes[s.index] && s.index >= batchStart && s.index < batchEnd)
      .map(s => `## 场景${s.num}\n\n${generatedScenes[s.index]}`)
      .join('\n\n');
    const params: Record<string, unknown> = { scenes_text: scenesText };
    if (genModel) params.model = genModel;
    tasksApi.create({
      workflow_type: 'generate_scene_diagnosis',
      input_params: params,
    }).then(({ data }) => {
      setPeriodicDiagnosisTaskId(data.id);
    }).catch(() => {
      toast({ title: '阶段性诊断启动失败', variant: 'destructive' });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedScenes, generatedScenes, genModel, completedCount]);

  // ── Single scene generation mutation ──
  const generateSceneMutation = useMutation({
    mutationFn: (sceneIndex: number) => {
      const scene = parsedScenes[sceneIndex];
      if (!scene) throw new Error('Scene not found');
      setPendingSceneIdx(sceneIndex);
      // Build accumulated context (last 2 scenes)
      const recentIndices = Object.keys(generatedScenes)
        .map(Number).sort((a, b) => a - b).slice(-2);
      const ctx = recentIndices.map(i => generatedScenes[i]).join('\n\n');
      const characterPrompt = buildCharacterPrompt(
        characterSettings.genre, characterSettings.format, characterSettings.tone,
      );
      return scriptsApi.generateScene({
        scene_index: sceneIndex,
        scene_num: scene.num,
        scene_raw: scene.raw,
        scene_location: scene.location,
        scene_summary: scene.summary,
        scene_characters: scene.characters,
        accumulated_context: ctx,
        total_scenes: parsedScenes.length,
        novel_content: novelContent,
        novel_analysis: novelAnalysis || '',
        character_setting_prompt: characterPrompt,
        chosen_structure: chosenStructure || undefined,
        structure_content: structureContent || undefined,
        ...(extraPrompt.trim() ? { prompt: extraPrompt.trim() } : {}),
        ...(genModel ? { model: genModel } : {}),
        ...(storyboardEnabled && storyboardStyle ? { storyboard_style_prompt: storyboardStyle } : {}),
      });
    },
    onSuccess: ({ data }) => {
      setSceneTaskId(data.id);
    },
    onError: () => {
      toast({ title: '创建场景生成任务失败', variant: 'destructive' });
    },
  });

  // ── Finalize: create script task with complete script ──
  const finalizeMutation = useMutation({
    mutationFn: async () => {
      return tasksApi.create({
        workflow_type: 'generate_script',
        input_params: {
          script_title: scriptTitle || '未命名剧本',
          script_content: accumulatedScript,
          generated_scenes: generatedScenes,
          interactive: true,
          novel_content: novelContent,
          novel_analysis: novelAnalysis || '',
          structure_content: structureContent || '',
          chosen_structure: chosenStructure || undefined,
          scene_outline_content: sceneOutlineContent || '',
        },
      });
    },
    onSuccess: ({ data }) => {
      setIsFinalizing(true);
      toast({ title: '剧本已完成，跳转结果页...' });
      // Use window.location to bypass Next.js route group cache issue
      window.location.href = `/result-view/script/${data.id}`;
    },
    onError: () => {
      toast({ title: '保存完整剧本失败', variant: 'destructive' });
      setIsFinalizing(false);
    },
  });

  // ── Handle diagnosis accept ──
  const handleAcceptDiagnosis = useCallback(() => {
    if (!diagnosisModifiedScenes) {
      setFinalDiagnosisDone(true);
      return;
    }
    setIsApplyingDiagnosis(true);
    // Apply modified scenes
    const updated: Record<number, string> = { ...generatedScenes };
    for (const [idxStr, newText] of Object.entries(diagnosisModifiedScenes)) {
      const idx = parseInt(idxStr, 10);
      if (!isNaN(idx)) {
        updated[idx - 1] = newText; // diagnosis uses 1-based indices ("修改场景 1")
      }
    }
    setGeneratedScenes(updated);
    // Rebuild accumulated script
    const allIndices = Object.keys(updated).map(Number).sort((a, b) => a - b);
    setAccumulatedScript(allIndices.map(i => updated[i]).join('\n\n'));
    setIsApplyingDiagnosis(false);
    setFinalDiagnosisDone(true);
    saveImmediate();
  }, [diagnosisModifiedScenes, generatedScenes, saveImmediate]);

  const handleSkipDiagnosis = useCallback(() => {
    setFinalDiagnosisDone(true);
  }, []);

  // ── Periodic diagnosis accept/dismiss ──
  const handleAcceptPeriodicDiagnosis = useCallback(() => {
    if (!frequentDiagnosisResult?.modifiedScenes) {
      setFrequentDiagnosisResult(null);
      return;
    }
    const updated = { ...generatedScenes };
    for (const [idxStr, newText] of Object.entries(frequentDiagnosisResult.modifiedScenes)) {
      const idx = parseInt(idxStr, 10);
      if (!isNaN(idx)) {
        updated[idx - 1] = newText; // diagnosis uses 1-based indices
      }
    }
    setGeneratedScenes(updated);
    const allIndices = Object.keys(updated).map(Number).sort((a, b) => a - b);
    setAccumulatedScript(allIndices.map(i => updated[i]).join('\n\n'));
    saveImmediate();
    setFrequentDiagnosisResult(null);
  }, [frequentDiagnosisResult, generatedScenes, saveImmediate]);

  const handleDismissPeriodicDiagnosis = useCallback(() => {
    setFrequentDiagnosisResult(null);
  }, []);

  // ── Scene viewer/editor handlers ──
  const handleOpenScene = useCallback((index: number) => {
    setSelectedSceneIndex(index);
    setEditingSceneContent(generatedScenes[index] || '');
    setActiveSceneView('script');
  }, [generatedScenes]);

  const handleCloseScene = useCallback(() => {
    if (selectedSceneIndex !== null && editingSceneContent !== generatedScenes[selectedSceneIndex]) {
      // Save edits
      setGeneratedScenes(prev => ({ ...prev, [selectedSceneIndex]: editingSceneContent }));
      // Rebuild accumulated script
      const allIndices = Object.keys({ ...generatedScenes, [selectedSceneIndex]: editingSceneContent })
        .map(Number).sort((a, b) => a - b);
      setAccumulatedScript(allIndices.map(i => i === selectedSceneIndex ? editingSceneContent : generatedScenes[i]).join('\n\n'));
      setTimeout(saveImmediate, 100);
    }
    setSelectedSceneIndex(null);
    setEditingSceneContent('');
  }, [selectedSceneIndex, editingSceneContent, generatedScenes, saveImmediate]);

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

  // ── Structure generation mutation ──
  const generateStructureMutation = useMutation({
    mutationFn: () => {
      const characterPrompt = buildCharacterPrompt(
        characterSettings.genre,
        characterSettings.format,
        characterSettings.tone,
      );
      return tasksApi.create({
        workflow_type: 'generate_script_structure',
        input_params: {
          novel_content: novelContent,
          novel_analysis: novelAnalysis || '',
          character_setting_prompt: characterPrompt,
          ...(genModel ? { model: genModel } : {}),
        },
      });
    },
    onSuccess: ({ data }) => {
      setStructureTaskId(data.id);
    },
    onError: () => {
      toast({ title: '创建结构生成任务失败', variant: 'destructive' });
    },
  });

  const isStructureGenerating = generateStructureMutation.isPending || !!structureTaskId;

  // ── Scene outline generation mutation ──
  const generateSceneOutlineMutation = useMutation({
    mutationFn: () => {
      const characterPrompt = buildCharacterPrompt(
        characterSettings.genre,
        characterSettings.format,
        characterSettings.tone,
      );
      return tasksApi.create({
        workflow_type: 'generate_scene_outline',
        input_params: {
          novel_content: novelContent,
          novel_analysis: novelAnalysis || '',
          structure_content: structureContent,
          chosen_structure: chosenStructure,
          character_setting_prompt: characterPrompt,
          ...(genModel ? { model: genModel } : {}),
        },
      });
    },
    onSuccess: ({ data }) => {
      setSceneOutlineTaskId(data.id);
    },
    onError: () => {
      toast({ title: '创建分场大纲任务失败', variant: 'destructive' });
    },
  });

  const isSceneOutlineGenerating = generateSceneOutlineMutation.isPending || !!sceneOutlineTaskId;

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
          chosen_structure: chosenStructure,
          structure_content: structureContent,
          scene_outline_content: sceneOutlineContent,
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
        <TabsList className="w-full justify-between rounded-lg bg-muted p-1 h-10">
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

        {/* ════════ TAB 1: 核心要素提取 ════════ */}
        <TabsContent value="novel_analysis" className="mt-6 space-y-6">
          <Card className="border-primary/30">
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-base">AI 核心要素提取</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  AI 将作为编剧消化小说内容，提炼改编所需的核心元素，包括故事梗概、人物小传、名场面和改编建议。
                </p>
              </div>

              {/* Character settings (editable inline) */}
              <Card className="bg-muted/50">
                <CardContent className="pt-3 pb-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">角色设定</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">类型</label>
                      <Select
                        value={characterSettings.genre}
                        onValueChange={(v) => setCharacterSettings({ ...characterSettings, genre: v })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="选择类型" />
                        </SelectTrigger>
                        <SelectContent>
                          {GENRE_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">格式</label>
                      <Select
                        value={characterSettings.format}
                        onValueChange={(v) => setCharacterSettings({ ...characterSettings, format: v })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="选择格式" />
                        </SelectTrigger>
                        <SelectContent>
                          {FORMAT_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">基调</label>
                      <Select
                        value={characterSettings.tone}
                        onValueChange={(v) => setCharacterSettings({ ...characterSettings, tone: v })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="选择基调" />
                        </SelectTrigger>
                        <SelectContent>
                          {TONE_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Bottom row: status text left, add button right */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {hasNovelSource
                        ? `已加载小说（${(novelContent.length / 1024).toFixed(1)} KB）`
                        : '尚未加载小说'}
                    </p>
                    <div className="relative">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground px-2"
                        onClick={() => setCharAddPopoverOpen((v) => !v)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        添加小说
                      </Button>
                      {charAddPopoverOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setCharAddPopoverOpen(false)} />
                          <div className="absolute right-0 bottom-full mb-1 z-50 w-44 rounded-md border bg-popover p-1 shadow-md text-sm">
                            <button
                              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent hover:text-accent-foreground text-left"
                              onClick={() => { setCharAddPopoverOpen(false); fileInputRef.current?.click(); }}
                            >
                              <FileText className="h-3.5 w-3.5 shrink-0" />
                              <span className="text-xs">本地上传小说</span>
                            </button>
                            <button
                              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent hover:text-accent-foreground text-left"
                              onClick={() => { setCharAddPopoverOpen(false); setAssetPopoverOpen(true); }}
                            >
                              <BookOpen className="h-3.5 w-3.5 shrink-0" />
                              <span className="text-xs">从资产选择</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Hidden file input for novel upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt"
                className="hidden"
                onChange={handleFileUpload}
              />

              {/* Asset novel popover (reused from add button) */}
              {assetPopoverOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAssetPopoverOpen(false)} />
                  <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-72 rounded-lg border bg-popover p-3 shadow-lg text-sm">
                    <div className="px-1 py-1.5 text-xs font-medium text-muted-foreground border-b mb-2">
                      已生成的小说
                    </div>
                    {assetNovels.length === 0 && (
                      <div className="px-2 py-4 text-xs text-muted-foreground text-center">暂无已生成的小说</div>
                    )}
                    <div className="max-h-48 overflow-y-auto space-y-1">
                    {assetNovels.slice(0, 5).map((item) => (
                      <button
                        key={item.id}
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-2 hover:bg-accent hover:text-accent-foreground text-left"
                        onClick={() => handleSelectAssetNovel(item)}
                      >
                        <span className="text-xs text-muted-foreground shrink-0">📖</span>
                        <span className="truncate text-xs">
                          {item.title || item.id.slice(0, 8)}
                        </span>
                      </button>
                    ))}
                    </div>
                  </div>
                </>
              )}

              {/* Analysis prompt preview */}
              <details className="rounded-md border border-muted-foreground/20 bg-muted/30">
                <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground select-none">
                  分析提示词（点击展开）
                </summary>
                <textarea
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-sans leading-relaxed"
                  value={editableAnalysisPrompt}
                  onChange={(e) => setEditableAnalysisPrompt(e.target.value)}
                  rows={6}
                />
              </details>

              {/* Analysis result */}
              {hasAnalysis && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">分析结果</label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setNovelAnalysis(null);
                        setScriptTitle(null);
                        analyzeMutation.mutate();
                      }}
                      disabled={isAnalyzing}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> 重新分析
                    </Button>
                  </div>
                  <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="pt-3 pb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <input
                        className="flex-1 text-sm font-medium bg-transparent border-b border-dotted border-primary/30 outline-none focus:border-primary px-1 py-0.5"
                        value={scriptTitle || ''}
                        onChange={(e) => setScriptTitle(e.target.value || null)}
                        placeholder="输入剧本名称..."
                      />
                    </CardContent>
                  </Card>
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
                <Button
                  className="flex-1 h-12 text-base"
                  onClick={() => handleTabChange('scene_outline')}
                  disabled={!hasAnalysis}
                >
                  <ChevronRight className="h-5 w-5 mr-2" />
                  确认，下一步
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>


        {/* ════════ TAB 4: 分场大纲（含结构搭建）════════ */}
        <TabsContent value="scene_outline" className="mt-6 space-y-6">
          {/* ── 结构搭建 ── */}
          <Card className={!hasStructure ? "border-primary/30" : ""}>
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold text-base">生成分场大纲</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  基于核心要素分析，AI 将提供两套经典剧本结构方案供你选择。确定结构方案后，再生成详细的分场大纲。
                </p>
              </div>

              <Card className="bg-muted/50">
                <CardContent className="pt-3 pb-3">
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>类型: <strong>{characterSettings.genre}</strong></span>
                    <span>格式: <strong>{characterSettings.format}</strong></span>
                    <span>基调: <strong>{characterSettings.tone}</strong></span>
                    <span>小说: <strong>{(novelContent.length / 1024).toFixed(1)} KB</strong></span>
                    {chosenStructure && <span>已选方案: <strong>方案{chosenStructure}</strong></span>}
                  </div>
                </CardContent>
              </Card>

              {!structureContent ? (
                <div className="flex flex-col gap-3">
                  <Button
                    className="w-full h-12 text-base"
                    onClick={() => generateStructureMutation.mutate()}
                    disabled={isStructureGenerating}
                  >
                    {isStructureGenerating ? (
                      <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> 生成结构方案中...</>
                    ) : (
                      <><LayoutTemplate className="h-5 w-5 mr-2" /> 生成结构方案</>
                    )}
                  </Button>

                  {isStructureGenerating && polledStructure && polledStructure.status !== 'SUCCESS' && polledStructure.status !== 'FAILED' && (
                    <div className="space-y-1">
                      <Progress value={(polledStructure as any).progress} />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{(polledStructure as any).current_step || '处理中...'}</span>
                        <span>{Math.round((polledStructure as any).progress)}%</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {chosenStructure ? (
                    <Card className="border-green-500 bg-green-50 dark:bg-green-950/20">
                      <CardContent className="pt-4 pb-4 flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <span className="text-sm font-medium">
                          已选择方案{chosenStructure}，可继续生成分场大纲
                        </span>
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      <p className="text-sm font-medium">请选择一种结构方案用于剧本创作：</p>

                      <div className="grid grid-cols-2 gap-4">
                        <Card
                          className="cursor-pointer transition-all hover:border-primary hover:shadow-md"
                          onClick={() => setChosenStructure('A')}
                        >
                          <CardContent className="pt-5 pb-5 space-y-3">
                            <h4 className="font-semibold text-base">方案A：经典三幕式结构</h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              建置 → 对抗 → 解决，适合大多数类型片的经典叙事结构。标注每个部分的关键情节转折点。
                            </p>
                            <Button variant="outline" size="sm" className="w-full">
                              选择此方案
                            </Button>
                          </CardContent>
                        </Card>

                        <Card
                          className="cursor-pointer transition-all hover:border-primary hover:shadow-md"
                          onClick={() => setChosenStructure('B')}
                        >
                          <CardContent className="pt-5 pb-5 space-y-3">
                            <h4 className="font-semibold text-base">方案B：Blake Snyder Beat Sheet</h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              好莱坞经典节拍表，15个节拍精确标注每个故事节点的对应原著情节。
                            </p>
                            <Button variant="outline" size="sm" className="w-full">
                              选择此方案
                            </Button>
                          </CardContent>
                        </Card>
                      </div>
                    </>
                  )}

                  {structureContent && (
                    <details className="rounded-md border border-muted-foreground/20 bg-muted/30">
                      <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground select-none">
                        完整结构方案（点击展开）
                      </summary>
                      <textarea
                        className="max-h-96 w-full px-4 pb-3 text-sm font-sans leading-relaxed bg-background border-0 resize-y focus:outline-none rounded-b-md"
                        value={structureContent}
                        onChange={(e) => setStructureContent(e.target.value)}
                        rows={10}
                      />
                    </details>
                  )}

                  {!chosenStructure && (
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setStructureContent(null);
                          generateStructureMutation.mutate();
                        }}
                        disabled={isStructureGenerating}
                      >
                        重新生成方案
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* ── 分场大纲按钮（放入结构搭建框内） ── */}
              {hasStructure && !sceneOutlineContent && (
                <div className="flex flex-col gap-3 pt-2 border-t border-border/50">
                  <Button
                    className="w-full h-12 text-base"
                    onClick={() => generateSceneOutlineMutation.mutate()}
                    disabled={isSceneOutlineGenerating}
                  >
                    {isSceneOutlineGenerating ? (
                      <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> 生成分场大纲中...</>
                    ) : (
                      <><ListOrdered className="h-5 w-5 mr-2" /> 生成分场大纲</>
                    )}
                  </Button>

                  {isSceneOutlineGenerating && polledSceneOutline && polledSceneOutline.status !== 'SUCCESS' && polledSceneOutline.status !== 'FAILED' && (
                    <div className="space-y-1">
                      <Progress value={(polledSceneOutline as any).progress} />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{(polledSceneOutline as any).current_step || '处理中...'}</span>
                        <span>{Math.round((polledSceneOutline as any).progress)}%</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {hasStructure && sceneOutlineContent && (
                <div className="space-y-4 pt-2 border-t border-border/50">
                  <Card className="border-green-500 bg-green-50 dark:bg-green-950/20">
                    <CardContent className="pt-4 pb-4 flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <span className="text-sm font-medium">分场大纲已生成（{parsedScenes.length} 场）</span>
                    </CardContent>
                  </Card>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">大纲内容</label>
                    <Card>
                      <CardContent className="pt-4 pb-4">
                        <pre className="text-sm whitespace-pre-wrap leading-relaxed font-sans">{sceneOutlineContent}</pre>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSceneOutlineContent(null);
                        generateSceneOutlineMutation.mutate();
                      }}
                      disabled={isSceneOutlineGenerating}
                    >
                      重新生成大纲
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => handleTabChange('novel_analysis')}>
                  返回分析
                </Button>
                <Button
                  className="flex-1 h-12 text-base"
                  onClick={() => {
                    if (hasSceneOutline) {
                      handleTabChange('generate');
                    }
                  }}
                  disabled={!hasSceneOutline}
                >
                  <ChevronRight className="h-5 w-5 mr-2" />
                  确认，下一步
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ TAB 6: 剧本生成 ════════ */}
        <TabsContent value="generate" className="mt-6 space-y-6">
          <Card className="border-primary/30">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-base">交互式剧本生成</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    逐场生成剧本，每完成 10 场 AI 自动诊断并提出修改建议。
                  </p>
                </div>
              </div>

              {/* Character settings summary */}
              <Card className="bg-muted/50">
                <CardContent className="pt-3 pb-3">
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>类型: <strong>{characterSettings.genre}</strong></span>
                    <span>格式: <strong>{characterSettings.format}</strong></span>
                    <span>基调: <strong>{characterSettings.tone}</strong></span>
                    <span>小说: <strong>{(novelContent.length / 1024).toFixed(1)} KB</strong></span>
                    <span>总场次: <strong>{parsedScenes.length}</strong></span>
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

              {/* Extra prompt + model selector (only show before generation starts) */}
              {completedCount === 0 && !generateSceneMutation.isPending && !sceneTaskId && (
                <>
                  <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
                    placeholder="可选：额外的编剧指令、格式要求、角色偏好..."
                    value={extraPrompt}
                    onChange={(e) => setExtraPrompt(e.target.value)}
                    rows={2}
                  />

                  {/* ── Predefined prompt chips ── */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground/50 mr-0.5">可选提示词</span>
                    <button
                      className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors cursor-pointer"
                      onClick={() =>
                        setExtraPrompt((prev) =>
                          prev
                            ? prev +
                              '\n将原文的内心独白改为具有象征意义的动作或道具细节。例如，原文"他感到悲伤"，改写为"他慢慢摘下眼镜，用拇指抹去镜片上的雨滴，重新戴上，面前的世界更加模糊"'
                            : '将原文的内心独白改为具有象征意义的动作或道具细节。例如，原文"他感到悲伤"，改写为"他慢慢摘下眼镜，用拇指抹去镜片上的雨滴，重新戴上，面前的世界更加模糊"'
                        )
                      }
                    >
                      内心独白→动作
                    </button>
                    <span className="text-[11px] text-muted-foreground/20">|</span>
                    <button
                      className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors cursor-pointer"
                      onClick={() =>
                        setExtraPrompt((prev) =>
                          prev
                            ? prev + '\n本场台词人均不超过3句，用眼神和环境音代替对话'
                            : '本场台词人均不超过3句，用眼神和环境音代替对话'
                        )
                      }
                    >
                      精简台词
                    </button>
                    <span className="text-[11px] text-muted-foreground/20">|</span>
                    <button
                      className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors cursor-pointer"
                      onClick={() =>
                        setExtraPrompt((prev) =>
                          prev
                            ? prev + '\n在以下场景中，要求写200字的人物沉默动作链'
                            : '在以下场景中，要求写200字的人物沉默动作链'
                        )
                      }
                    >
                      沉默动作链
                    </button>
                    <span className="text-[11px] text-muted-foreground/20">|</span>
                    <button
                      className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors cursor-pointer"
                      onClick={() =>
                        setExtraPrompt((prev) =>
                          prev
                            ? prev + '\n保持人物逻辑一致性，避免对白中的"AI味"（过于工整缺乏口语毛边）'
                            : '保持人物逻辑一致性，避免对白中的"AI味"（过于工整缺乏口语毛边）'
                        )
                      }
                    >
                      去AI味
                    </button>
                  </div>

                  {/* ── Storyboard style chips ── */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-muted-foreground/10">
                    <span className="text-[11px] text-muted-foreground/50 mr-0.5">画面风格</span>
                    {(['真人', '2D', '3D'] as const).map((style, idx) => {
                      const isActive = storyboardStyle === STORYBOARD_STYLE_MAP[style];
                      return (
                        <Fragment key={style}>
                          <button
                            className={`text-[11px] transition-colors cursor-pointer ${
                              isActive ? 'text-primary font-medium' : 'text-muted-foreground/40 hover:text-muted-foreground/70'
                            }`}
                            onClick={() =>
                              setStoryboardStyle(isActive ? '' : STORYBOARD_STYLE_MAP[style])
                            }
                          >
                            {style}
                          </button>
                          {idx < 2 && <span className="text-[11px] text-muted-foreground/20">|</span>}
                        </Fragment>
                      );
                    })}
                  </div>

                  {/* ── Storyboard toggle ── */}
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={storyboardEnabled}
                      onChange={(e) => setStoryboardEnabled(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-muted-foreground/30 text-primary focus:ring-primary/30"
                    />
                    同时生成分镜头脚本
                  </label>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ModelSelector value={genModel} onChange={setGenModel} />
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 h-8 text-xs"
                        onClick={() => document.getElementById('script-example-upload')?.click()}
                      >
                        <Plus className="h-3.5 w-3.5" /> 剧本示例
                      </Button>
                      <input
                        id="script-example-upload"
                        type="file"
                        accept=".txt"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          e.target.value = '';
                          const reader = new FileReader();
                          reader.onload = () => {
                            const text = reader.result as string;
                            setExtraPrompt(`请完全模仿以上剧本格式来写作\n\n\`\`\`\n${text}\n\`\`\``);
                            toast({ title: '已加载剧本示例' });
                          };
                          reader.readAsText(file);
                        }}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* ── Progress overview ── */}
              {parsedScenes.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        已完成 {completedCount}/{parsedScenes.length} 场
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">
                          {parsedScenes.filter(s => s.status === 'completed').length} 完成
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                          {parsedScenes.filter(s => s.status === 'pending').length} 待生成
                        </Badge>
                        {parsedScenes.filter(s => s.status === 'failed').length > 0 && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                            {parsedScenes.filter(s => s.status === 'failed').length} 失败
                          </Badge>
                        )}
                      </div>
                    </div>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {parsedScenes.length > 0 ? Math.round((completedCount / parsedScenes.length) * 100) : 0}%
                    </span>
                  </div>
                  <Progress value={parsedScenes.length > 0 ? (completedCount / parsedScenes.length) * 100 : 0} className="h-2" />
                </div>
              )}

              {/* ── Scene list (clickable) ── */}
              {parsedScenes.length > 0 ? (
                <div className="h-[600px] rounded-md border overflow-y-auto [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/30 [&::-webkit-scrollbar-track]:bg-transparent">
                  <div className="p-1 space-y-0.5" role="listbox" aria-label="场景列表">
                    {parsedScenes.map((scene) => {
                      const isSelected = selectedSceneIndex === scene.index;
                      const hasContent = !!generatedScenes[scene.index];
                      const statusConfig = scene.status === 'completed'
                        ? { icon: CheckCircle2, className: 'text-green-500', label: '已完成' }
                        : scene.status === 'generating'
                        ? { icon: Loader2, className: 'text-muted-foreground animate-spin', label: '生成中' }
                        : scene.status === 'failed'
                        ? { icon: AlertCircle, className: 'text-destructive', label: '失败' }
                        : { icon: PauseCircle, className: 'text-muted-foreground', label: '待生成' };
                      const StatusIcon = statusConfig.icon;
                      return (
                        <button
                          key={scene.index}
                          role="option"
                          aria-selected={isSelected}
                          aria-label={`场景 #${scene.num}${scene.summary ? `：${scene.summary}` : ''} - ${statusConfig.label}`}
                          className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                            isSelected
                              ? 'bg-primary/10 ring-1 ring-primary/30'
                              : 'hover:bg-muted/50'
                          }`}
                          onClick={() => handleOpenScene(scene.index)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleOpenScene(scene.index);
                            }
                          }}
                        >
                          <StatusIcon className={`h-4 w-4 flex-shrink-0 ${statusConfig.className}`} aria-hidden="true" />
                          <span className="text-xs font-medium text-muted-foreground w-10 flex-shrink-0" aria-label={`场号 ${scene.num}`}>#{scene.num !== '0' ? scene.num : scene.index + 1}</span>
                          <span className="text-xs text-muted-foreground truncate flex-1">
                            {scene.location ? `${scene.scene_type || ''}${scene.scene_type && scene.location ? '/' : ''}${scene.location}` : scene.summary || ''}
                          </span>
                          {scene.location && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 hidden sm:inline-flex">
                              {scene.location}
                            </Badge>
                          )}
                          {hasContent && <FileText className="h-3 w-3 text-muted-foreground/40 flex-shrink-0 ml-1" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <ListOrdered className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm">暂无场景。完成分场大纲后进入此页面生成剧本。</p>
                </div>
              )}

              {/* ── Scene viewer / editor (Sheet panel) ── */}
              <Sheet open={selectedSceneIndex !== null} onOpenChange={(open) => {
                if (!open) handleCloseScene();
              }}>
                <SheetContent side="right" className="w-full sm:max-w-xl md:max-w-3xl lg:max-w-5xl flex flex-col">
                  <SheetHeader className="border-b pb-3 mb-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <SheetTitle>
                        第{parsedScenes[selectedSceneIndex!]?.num && parsedScenes[selectedSceneIndex!]!.num !== '0' ? parsedScenes[selectedSceneIndex!]!.num : (selectedSceneIndex! + 1)}场
                      </SheetTitle>
                      {parsedScenes[selectedSceneIndex!]?.location && (
                        <Badge variant="secondary" className="text-xs">
                          {parsedScenes[selectedSceneIndex!].location}
                        </Badge>
                      )}
                    </div>
                    {parsedScenes[selectedSceneIndex!]?.summary && (
                      <SheetDescription className="text-xs text-muted-foreground">
                        {parsedScenes[selectedSceneIndex!].summary}
                      </SheetDescription>
                    )}
                  </SheetHeader>

                  {/* Scene tabs for quick switching */}
                  {parsedScenes.length > 0 && (
                    <div className="flex items-center gap-1 overflow-x-auto pb-2 border-b mb-3 shrink-0" role="tablist" aria-label="场景快速切换">
                      {parsedScenes.map((scene) => {
                        const hasContent = !!generatedScenes[scene.index];
                        const isFailed = scene.status === 'failed';
                        return (
                          <button
                            key={scene.index}
                            role="tab"
                            aria-selected={selectedSceneIndex === scene.index}
                            className={`shrink-0 px-2.5 py-1 text-xs rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              selectedSceneIndex === scene.index
                                ? 'bg-primary text-primary-foreground'
                                : 'hover:bg-muted'
                            } ${isFailed ? 'text-destructive' : ''}`}
                            onClick={() => {
                              if (selectedSceneIndex !== null && editingSceneContent !== generatedScenes[selectedSceneIndex]) {
                                setGeneratedScenes(prev => ({ ...prev, [selectedSceneIndex!]: editingSceneContent }));
                              }
                              setSelectedSceneIndex(scene.index);
                              setEditingSceneContent(generatedScenes[scene.index] || '');
                            }}
                          >
                            #{scene.num !== '0' ? scene.num : scene.index + 1}
                            {hasContent && <CheckCircle2 className="h-2.5 w-2.5 inline ml-0.5" />}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Sub-tabs: 剧本 / 分镜头脚本 */}
                  {generatedScenes[selectedSceneIndex!] && (
                    <div className="flex items-center gap-1 pb-2 border-b mb-3 shrink-0">
                      <button
                        className={`px-3 py-1 text-xs rounded-md transition-colors ${
                          activeSceneView === 'script' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => setActiveSceneView('script')}
                      >
                        剧本
                      </button>
                      <button
                        className={`px-3 py-1 text-xs rounded-md transition-colors ${
                          activeSceneView === 'storyboard' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => setActiveSceneView('storyboard')}
                      >
                        分镜头脚本
                        {sceneStoryboards[selectedSceneIndex!] && (
                          <CheckCircle2 className="h-2.5 w-2.5 inline ml-1 text-green-500" />
                        )}
                      </button>
                      <button
                        className={`px-3 py-1 text-xs rounded-md transition-colors ${
                          activeSceneView === 'character_prompt' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => setActiveSceneView('character_prompt')}
                      >
                        角色生图
                        {sceneCharacterPrompts[selectedSceneIndex!] && (
                          <CheckCircle2 className="h-2.5 w-2.5 inline ml-1 text-green-500" />
                        )}
                      </button>
                      <button
                        className={`px-3 py-1 text-xs rounded-md transition-colors ${
                          activeSceneView === 'scene_prompt' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => setActiveSceneView('scene_prompt')}
                      >
                        场景生图
                        {sceneScenePrompts[selectedSceneIndex!] && (
                          <CheckCircle2 className="h-2.5 w-2.5 inline ml-1 text-green-500" />
                        )}
                      </button>
                      <button
                        className={`px-3 py-1 text-xs rounded-md transition-colors ${
                          activeSceneView === 'prop_prompt' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => setActiveSceneView('prop_prompt')}
                      >
                        道具生图
                        {scenePropPrompts[selectedSceneIndex!] && (
                          <CheckCircle2 className="h-2.5 w-2.5 inline ml-1 text-green-500" />
                        )}
                      </button>
                    </div>
                  )}

                  {/* Scene content */}
                  <div className="flex-1 overflow-y-auto min-h-0">
                    {activeSceneView === 'script' && (
                      generatedScenes[selectedSceneIndex!] ? (
                        <textarea
                          className="flex min-h-[300px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-mono leading-relaxed"
                          value={editingSceneContent}
                          onChange={(e) => setEditingSceneContent(e.target.value)}
                          rows={12}
                          aria-label={`编辑第${parsedScenes[selectedSceneIndex!]?.num && parsedScenes[selectedSceneIndex!]!.num !== '0' ? parsedScenes[selectedSceneIndex!]!.num : (selectedSceneIndex! + 1)}场剧本`}
                        />
                      ) : (
                        <div className="text-center py-12 text-muted-foreground text-sm">
                          {parsedScenes[selectedSceneIndex!]?.status === 'generating' ? (
                            <div className="space-y-2">
                              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                              <p>正在生成中...</p>
                            </div>
                          ) : parsedScenes[selectedSceneIndex!]?.status === 'failed' ? (
                            <div className="space-y-3">
                              <AlertCircle className="h-6 w-6 mx-auto text-destructive" />
                              <p className="text-destructive">生成失败</p>
                              <Button size="sm" variant="outline" onClick={() => {
                                generateSceneMutation.mutate(selectedSceneIndex!);
                              }}>
                                <RefreshCw className="h-4 w-4 mr-1" /> 重试
                              </Button>
                            </div>
                          ) : (
                            <>
                              <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                              <p>尚未生成。点击"生成下一场"按钮开始。</p>
                            </>
                          )}
                        </div>
                      )
                    )}

                    {activeSceneView === 'storyboard' && (
                      <div className="space-y-3">
                        {sceneStoryboards[selectedSceneIndex!] ? (
                          <>
                            {/* Parsed shot cards */}
                            <div className="rounded-md border border-muted/50 bg-muted/20 p-3 space-y-2">
                              <h4 className="text-xs font-medium text-muted-foreground">镜头列表</h4>
                              {(() => {
                                const shots: { label: string; description: string }[] = [];
                                for (const line of sceneStoryboards[selectedSceneIndex!].split('\n')) {
                                  const trimmed = line.trim();
                                  if (!trimmed) continue;
                                  const match = trimmed.match(/^【镜头(\d+)】\s*(.+)/);
                                  if (match) {
                                    shots.push({ label: `镜头 ${match[1]}`, description: match[2].trim() });
                                  }
                                }
                                return shots.length > 0 ? (
                                  shots.map((shot, i) => (
                                    <div key={i} className="border-b border-muted/30 pb-2 last:border-0 last:pb-0">
                                      <span className="text-xs font-medium text-primary/70">{shot.label}</span>
                                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{shot.description}</p>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-xs text-muted-foreground">未能解析镜头列表，请在下方原文中查看。</p>
                                );
                              })()}
                            </div>
                            {/* Editable raw text */}
                            <textarea
                              className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-mono leading-relaxed"
                              value={sceneStoryboards[selectedSceneIndex!] || ''}
                              onChange={(e) =>
                                setSceneStoryboards(prev => ({ ...prev, [selectedSceneIndex!]: e.target.value }))
                              }
                              rows={8}
                              aria-label={`第${parsedScenes[selectedSceneIndex!]?.num && parsedScenes[selectedSceneIndex!]!.num !== '0' ? parsedScenes[selectedSceneIndex!]!.num : (selectedSceneIndex! + 1)}场分镜头脚本`}
                            />
                          </>
                        ) : (
                          <div className="text-center py-12 text-muted-foreground text-sm">
                            <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                            <p>尚未生成分镜头脚本。请在生成时勾选"同时生成分镜头脚本"。</p>
                          </div>
                        )}
                      </div>
                    )}

                    {activeSceneView === 'character_prompt' && (
                      <div className="space-y-3">
                        {sceneCharacterPrompts[selectedSceneIndex!] ? (
                          <textarea
                            className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-mono leading-relaxed"
                            value={sceneCharacterPrompts[selectedSceneIndex!] || ''}
                            onChange={(e) =>
                              setSceneCharacterPrompts(prev => ({ ...prev, [selectedSceneIndex!]: e.target.value }))
                            }
                            rows={12}
                            aria-label={`第${parsedScenes[selectedSceneIndex!]?.num && parsedScenes[selectedSceneIndex!]!.num !== '0' ? parsedScenes[selectedSceneIndex!]!.num : (selectedSceneIndex! + 1)}场角色生图提示词`}
                          />
                        ) : (
                          <div className="text-center py-12 text-muted-foreground text-sm">
                            <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                            <p>尚未生成角色生图提示词。请在生成时勾选"同时生成分镜头脚本"。</p>
                          </div>
                        )}
                      </div>
                    )}

                    {activeSceneView === 'scene_prompt' && (
                      <div className="space-y-3">
                        {sceneScenePrompts[selectedSceneIndex!] ? (
                          <textarea
                            className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-mono leading-relaxed"
                            value={sceneScenePrompts[selectedSceneIndex!] || ''}
                            onChange={(e) =>
                              setSceneScenePrompts(prev => ({ ...prev, [selectedSceneIndex!]: e.target.value }))
                            }
                            rows={12}
                            aria-label={`第${parsedScenes[selectedSceneIndex!]?.num && parsedScenes[selectedSceneIndex!]!.num !== '0' ? parsedScenes[selectedSceneIndex!]!.num : (selectedSceneIndex! + 1)}场场景生图提示词`}
                          />
                        ) : (
                          <div className="text-center py-12 text-muted-foreground text-sm">
                            <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                            <p>尚未生成场景生图提示词。请在生成时勾选"同时生成分镜头脚本"。</p>
                          </div>
                        )}
                      </div>
                    )}

                    {activeSceneView === 'prop_prompt' && (
                      <div className="space-y-3">
                        {scenePropPrompts[selectedSceneIndex!] ? (
                          <textarea
                            className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-mono leading-relaxed"
                            value={scenePropPrompts[selectedSceneIndex!] || ''}
                            onChange={(e) =>
                              setScenePropPrompts(prev => ({ ...prev, [selectedSceneIndex!]: e.target.value }))
                            }
                            rows={12}
                            aria-label={`第${parsedScenes[selectedSceneIndex!]?.num && parsedScenes[selectedSceneIndex!]!.num !== '0' ? parsedScenes[selectedSceneIndex!]!.num : (selectedSceneIndex! + 1)}场道具生图提示词`}
                          />
                        ) : (
                          <div className="text-center py-12 text-muted-foreground text-sm">
                            <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                            <p>尚未生成道具生图提示词。请在生成时勾选"同时生成分镜头脚本"。</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer actions */}
                  {generatedScenes[selectedSceneIndex!] && (
                    <SheetFooter className="border-t pt-3 mt-3 shrink-0">
                      <div className="flex items-center justify-between w-full gap-2">
                        <div className="flex items-center gap-2">
                          {editingSceneContent !== generatedScenes[selectedSceneIndex!] && (
                            <Button size="sm" variant="outline" onClick={() => {
                              setEditingSceneContent(generatedScenes[selectedSceneIndex!] || '');
                            }}>
                              <RotateCcw className="h-3.5 w-3.5 mr-1" /> 撤销
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => {
                            const idx = selectedSceneIndex!;
                            setEditingSceneContent(generatedScenes[idx] || '');
                            setParsedScenes(prev => prev.map(s => s.index === idx ? { ...s, status: 'generating' as const } : s));
                            generateSceneMutation.mutate(idx);
                          }} disabled={generateSceneMutation.isPending || !!sceneTaskId}>
                            <RefreshCw className="h-3.5 w-3.5 mr-1" /> 重新生成
                          </Button>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={handleCloseScene}>
                            关闭
                          </Button>
                          <Button size="sm" onClick={() => {
                            if (editingSceneContent !== generatedScenes[selectedSceneIndex!]) {
                              setGeneratedScenes(prev => ({ ...prev, [selectedSceneIndex!]: editingSceneContent }));
                              const updated = { ...generatedScenes, [selectedSceneIndex!]: editingSceneContent };
                              const allIndices = Object.keys(updated).map(Number).sort((a, b) => a - b);
                              setAccumulatedScript(allIndices.map(i => updated[i]).join('\n\n'));
                              setTimeout(saveImmediate, 100);
                              toast({ title: `第${parsedScenes[selectedSceneIndex!]?.num && parsedScenes[selectedSceneIndex!]!.num !== '0' ? parsedScenes[selectedSceneIndex!]!.num : selectedSceneIndex! + 1}场已保存` });
                            }
                            handleCloseScene();
                          }}>
                            保存
                          </Button>
                        </div>
                      </div>
                    </SheetFooter>
                  )}
                </SheetContent>
              </Sheet>

              {/* ── Action area ── */}
              {!interactiveScriptDone && (
                <div className="space-y-3">
                  {/* Retry failed scenes — shown when there are failed scenes */}
                  {parsedScenes.filter(s => s.status === 'failed').length > 0 && (
                    <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-destructive">
                          <AlertCircle className="h-4 w-4" />
                          <span>{parsedScenes.filter(s => s.status === 'failed').length} 个场景生成失败</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const firstFailed = parsedScenes.find(s => s.status === 'failed');
                            if (firstFailed) {
                              setParsedScenes(prev => prev.map(s => s.index === firstFailed.index ? { ...s, status: 'generating' as const } : s));
                              generateSceneMutation.mutate(firstFailed.index);
                            }
                          }}
                          disabled={generateSceneMutation.isPending || !!sceneTaskId}
                        >
                          <RefreshCw className="h-4 w-4 mr-1" />
                          重试失败场景
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Generate next — with transition */}
                  <div className="transition-all duration-300 ease-in-out">
                    {!sceneTaskId && !diagnosisTaskId && !finalDiagnosisDone && completedCount < parsedScenes.length && (
                      <Button
                        className="w-full h-12 text-base transition-all duration-200 active:scale-[0.98]"
                        onClick={() => {
                          const nextIdx = currentSceneIdx;
                          if (nextIdx < parsedScenes.length) {
                            setParsedScenes(prev => prev.map(s => s.index === nextIdx ? { ...s, status: 'generating' as const } : s));
                            generateSceneMutation.mutate(nextIdx);
                          }
                        }}
                        disabled={generateSceneMutation.isPending}
                      >
                        <Sparkles className="h-5 w-5 mr-2" />
                        生成下一场（第{currentSceneIdx + 1}场/共{parsedScenes.length}场）
                      </Button>
                    )}
                  </div>

                  {/* Generating progress — with fade-in */}
                  {sceneTaskId && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        正在生成第{currentSceneIdx + 1}场...
                      </div>
                      <Progress value={(polledScene as any)?.progress || 50} />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{(polledScene as any)?.current_step || '处理中...'}</span>
                        <span>{Math.round((polledScene as any)?.progress || 50)}%</span>
                      </div>
                    </div>
                  )}

                  {/* Periodic diagnosis in progress */}
                  {periodicDiagnosisTaskId && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-1 mt-2">
                      <div className="flex items-center gap-2 text-sm text-amber-600">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        阶段性诊断分析中（前{completedCount}场）...
                      </div>
                      <Progress value={(polledPeriodicDiagnosis as any)?.progress || 50} />
                    </div>
                  )}

                  {/* ── Periodic diagnosis result banner ── */}
                  {frequentDiagnosisResult && !finalDiagnosisDone && (
                    <Card className="border-amber-400 bg-amber-50 dark:bg-amber-950/20">
                      <CardContent className="pt-4 pb-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Stethoscope className="h-4 w-4 text-amber-600 shrink-0" />
                          <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                            阶段性诊断结果（前{frequentDiagnosisResult.sceneCount}场）
                          </span>
                        </div>
                        <details className="text-sm">
                          <summary className="cursor-pointer text-amber-700 dark:text-amber-300 hover:underline">
                            查看诊断报告
                          </summary>
                          <pre className="mt-2 text-xs whitespace-pre-wrap leading-relaxed font-sans bg-amber-100/50 dark:bg-amber-900/20 p-3 rounded-md max-h-48 overflow-y-auto">
                            {frequentDiagnosisResult.diagnosis}
                          </pre>
                        </details>
                        {frequentDiagnosisResult.modifiedScenes && Object.keys(frequentDiagnosisResult.modifiedScenes).length > 0 ? (
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-xs text-amber-700 dark:text-amber-300">
                              发现 {Object.keys(frequentDiagnosisResult.modifiedScenes).length} 处修改建议
                            </span>
                            <Button size="sm" variant="outline" className="text-xs h-7" onClick={handleAcceptPeriodicDiagnosis}>
                              接受修改
                            </Button>
                            <Button size="sm" variant="ghost" className="text-xs h-7" onClick={handleDismissPeriodicDiagnosis}>
                              忽略
                            </Button>
                          </div>
                        ) : (
                          <p className="text-xs text-amber-700 dark:text-amber-300">未发现需修改的问题。</p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                  {diagnosisTaskId && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Stethoscope className="h-4 w-4 animate-pulse" />
                        AI 全剧诊断中...
                      </div>
                      <Progress value={(polledDiagnosis as any)?.progress || 30} />
                    </div>
                  )}

                  {/* All scenes done — show "go to diagnosis" button or finalize */}
                  {!sceneTaskId && !diagnosisTaskId && completedCount >= parsedScenes.length && parsedScenes.length > 0 && (
                    <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 space-y-2">
                      {!finalDiagnosisDone ? (
                        <Button
                          className="w-full h-12 text-base"
                          onClick={() => handleTabChange('diagnosis')}
                        >
                          <Stethoscope className="h-5 w-5 mr-2" />
                          前往诊断
                        </Button>
                      ) : (
                        <>
                          <Card className="border-green-500 bg-green-50 dark:bg-green-950/20">
                            <CardContent className="pt-3 pb-3 flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                              <span className="text-sm text-green-700 dark:text-green-300">全剧诊断完成</span>
                            </CardContent>
                          </Card>
                          <Button
                            className="w-full h-12 text-base"
                            onClick={() => finalizeMutation.mutate()}
                            disabled={finalizeMutation.isPending}
                          >
                            {finalizeMutation.isPending ? (
                              <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> 保存中...</>
                            ) : (
                              <><CheckCircle2 className="h-5 w-5 mr-2" /> 完成，查看完整剧本</>
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {interactiveScriptDone && (
                <div className="text-center py-6">
                  <CheckCircle2 className="h-10 w-10 mx-auto text-green-500 mb-2" />
                  <p className="text-sm font-medium">剧本已全部生成完成</p>
                  <Button className="mt-4" onClick={() => router.push('/')}>
                    返回首页
                  </Button>
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
                <Button variant="outline" onClick={() => handleTabChange('scene_outline')}>
                  返回分场大纲
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ TAB 4: 剧本诊断 ════════ */}
        <TabsContent value="diagnosis" className="mt-6 space-y-6">
          <Card className="border-primary/30">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-base">AI 全剧诊断</h3>
                </div>
              </div>

              {/* State 1: Not started — show launch button */}
              {!diagnosisTaskId && !diagnosisResult && !finalDiagnosisDone && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    所有场景已生成完毕。启动 AI 全剧诊断，检查剧本质量并获取修改建议。
                  </p>
                  <Button
                    className="w-full h-12 text-base"
                    onClick={launchFinalDiagnosis}
                  >
                    <Stethoscope className="h-5 w-5 mr-2" />
                    启动全剧诊断
                  </Button>
                </div>
              )}

              {/* State 2: Running — show progress */}
              {diagnosisTaskId && !diagnosisResult && (
                <div className="space-y-3 py-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    诊断分析中...
                  </div>
                  <Progress value={(polledDiagnosis as any)?.progress || 30} />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{(polledDiagnosis as any)?.current_step || '分析中...'}</span>
                    <span>{Math.round((polledDiagnosis as any)?.progress || 30)}%</span>
                  </div>
                </div>
              )}

              {/* State 3: Result ready — show report + accept/skip */}
              {diagnosisResult && !finalDiagnosisDone && (
                <>
                  <ScrollArea className="max-h-[50vh] rounded-md border">
                    <div className="p-4">
                      <pre className="text-sm whitespace-pre-wrap leading-relaxed font-sans">{diagnosisResult}</pre>
                    </div>
                  </ScrollArea>

                  {diagnosisModifiedScenes && Object.keys(diagnosisModifiedScenes).length > 0 && (
                    <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3">
                      <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                          {Object.keys(diagnosisModifiedScenes).length} 个场景有修改建议
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                          接受修改将更新已生成的场景文本。
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" onClick={handleSkipDiagnosis} disabled={isApplyingDiagnosis} className="flex-1">
                      跳过
                    </Button>
                    <Button onClick={handleAcceptDiagnosis} disabled={isApplyingDiagnosis} className="flex-1">
                      {isApplyingDiagnosis ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> 应用中...</>
                      ) : (
                        <><CheckCircle2 className="h-4 w-4 mr-2" /> 接受修改{diagnosisModifiedScenes ? `（${Object.keys(diagnosisModifiedScenes).length} 处）` : ''}</>
                      )}
                    </Button>
                  </div>
                </>
              )}

              {/* State 4: Done — show finalize */}
              {finalDiagnosisDone && (
                <div className="space-y-4">
                  <Card className="border-green-500 bg-green-50 dark:bg-green-950/20">
                    <CardContent className="pt-3 pb-3 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      <span className="text-sm text-green-700 dark:text-green-300">全剧诊断完成</span>
                    </CardContent>
                  </Card>
                  <Button
                    className="w-full h-12 text-base"
                    onClick={() => finalizeMutation.mutate()}
                    disabled={finalizeMutation.isPending}
                  >
                    {finalizeMutation.isPending ? (
                      <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> 保存中...</>
                    ) : (
                      <><CheckCircle2 className="h-5 w-5 mr-2" /> 完成，查看完整剧本</>
                    )}
                  </Button>
                </div>
              )}

              {/* Back button */}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => handleTabChange('generate')}>
                  返回剧本生成
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}

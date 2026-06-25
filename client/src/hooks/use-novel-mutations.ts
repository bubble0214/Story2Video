'use client';

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useTaskPoll } from '@/hooks/use-task-poll';
import { toast } from '@/hooks/use-toast';
import type { TaskResp } from '@/types/task';

export interface UseNovelMutationsOptions {
  inputParamsBase: () => Record<string, any>;
  outlineContent: string;
  volumeOutlineContent: string;
  characterRulesContent: string;
  saveDraft: (step: string, overrides?: Record<string, any>, completed?: boolean) => Promise<void>;
}

export function useNovelMutations({
  inputParamsBase, outlineContent, volumeOutlineContent, characterRulesContent, saveDraft,
}: UseNovelMutationsOptions) {
  const setCurrentTaskId = useWorkflowStore((s) => s.setCurrentTaskId);
  const setOutlineContent = useWorkflowStore((s) => s.setOutlineContent);
  const setVolumeOutlineContent = useWorkflowStore((s) => s.setVolumeOutlineContent);
  const setCharacterRulesContent = useWorkflowStore((s) => s.setCharacterRulesContent);
  const setNovelContent = useWorkflowStore((s) => s.setNovelContent);

  // Polling task IDs
  const [outlinePollingTaskId, setOutlinePollingTaskId] = useState<string | null>(null);
  const [volumeOutlinePollingTaskId, setVolumeOutlinePollingTaskId] = useState<string | null>(null);
  const [characterRulesPollingTaskId, setCharacterRulesPollingTaskId] = useState<string | null>(null);
  const [novelPollingTaskId, setNovelPollingTaskId] = useState<string | null>(null);

  // Outline mutation
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

  // Volume outline mutation
  const volumeOutlineMutation = useMutation({
    mutationFn: () =>
      tasksApi.create({
        workflow_type: 'generate_volume_outline_only',
        input_params: { ...inputParamsBase(), outline_text: outlineContent },
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

  // Character rules mutation
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

  // Batch novel mutation
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
      toast({ title: '小说生成失败', description: e.response?.data?.detail || e.message, variant: 'destructive' });
    },
  });

  // ── Polling queries ──
  const polledOutlineTask = useTaskPoll(outlinePollingTaskId!, !!outlinePollingTaskId);
  const polledVolumeOutlineTask = useTaskPoll(volumeOutlinePollingTaskId!, !!volumeOutlinePollingTaskId);
  const polledCharacterRulesTask = useTaskPoll(characterRulesPollingTaskId!, !!characterRulesPollingTaskId);
  const polledNovelTask = useTaskPoll(novelPollingTaskId!, !!novelPollingTaskId);

  // ── Poll result handlers (called externally from useEffect in parent) ──
  const handleOutlineResult = useCallback((task: TaskResp) => {
    if (!task) return;
    if (task.status === 'SUCCESS') {
      const result = task.result;
      const outlineText = result?.outline_text as string | undefined;
      if (outlineText?.trim()) {
        setOutlineContent(outlineText);
        toast({ title: '大纲生成完成', description: '请查看并确认大纲内容' });
        saveDraft('outline', { outlineText });
      } else {
        toast({ title: '大纲生成异常', description: '未获取到有效大纲', variant: 'destructive' });
      }
      setOutlinePollingTaskId(null);
      setCurrentTaskId(null);
      return 'outline';
    } else if (task.status === 'FAILED') {
      setOutlinePollingTaskId(null);
      toast({ title: '大纲生成失败', description: task.error_message || '未知错误', variant: 'destructive' });
    }
    return null;
  }, [setOutlineContent, setCurrentTaskId, saveDraft]);

  const handleVolumeOutlineResult = useCallback((task: TaskResp) => {
    if (!task) return;
    if (task.status === 'SUCCESS') {
      const result = task.result;
      const volOutline = result?.volume_outline_text as string | undefined;
      if (volOutline?.trim()) {
        setVolumeOutlineContent(volOutline);
        toast({ title: '第一卷细纲生成完成', description: '请查看并确认细纲，然后开始生成小说' });
        saveDraft('volume', { volumeOutlineText: volOutline });
      } else {
        toast({ title: '细纲生成异常', description: '未获取到有效细纲', variant: 'destructive' });
      }
      setVolumeOutlinePollingTaskId(null);
      setCurrentTaskId(null);
      return 'volume';
    } else if (task.status === 'FAILED') {
      setVolumeOutlinePollingTaskId(null);
      toast({ title: '细纲生成失败', description: task.error_message || '未知错误', variant: 'destructive' });
    }
    return null;
  }, [setVolumeOutlineContent, setCurrentTaskId, saveDraft]);

  const handleCharacterRulesResult = useCallback((task: TaskResp) => {
    if (!task) return;
    if (task.status === 'SUCCESS') {
      const result = task.result;
      const rules = result?.character_rules_text as string | undefined;
      if (rules?.trim()) {
        setCharacterRulesContent(rules);
        toast({ title: '人物行为守则生成完成', description: '请查看守则细节，确认角色行为一致性' });
        saveDraft('rules', { characterRulesText: rules });
      } else {
        toast({ title: '守则生成异常', description: '未获取到有效守则', variant: 'destructive' });
      }
      setCharacterRulesPollingTaskId(null);
      setCurrentTaskId(null);
      return 'rules';
    } else if (task.status === 'FAILED') {
      setCharacterRulesPollingTaskId(null);
      toast({ title: '人物守则生成失败', description: task.error_message || '未知错误', variant: 'destructive' });
    }
    return null;
  }, [setCharacterRulesContent, setCurrentTaskId, saveDraft]);

  const handleNovelResult = useCallback((task: TaskResp) => {
    if (!task) return;
    if (task.status === 'SUCCESS') {
      const result = task.result;
      const novelContentVal = result?.novel_content as string | undefined;
      if (novelContentVal) {
        setNovelContent(novelContentVal);
      }
      setNovelPollingTaskId(null);
      setCurrentTaskId(null);
      toast({ title: '小说生成完成' });
      saveDraft('generate', { novelContent: novelContentVal ?? '' }, true);
      return 'generate';
    } else if (task.status === 'FAILED') {
      setNovelPollingTaskId(null);
      toast({ title: '小说生成失败', description: task.error_message || '未知错误', variant: 'destructive' });
    }
    return null;
  }, [setNovelContent, setCurrentTaskId, saveDraft]);

  const isOutlinePending = outlineMutation.isPending || !!outlinePollingTaskId;
  const isVolumeOutlinePending = volumeOutlineMutation.isPending || !!volumeOutlinePollingTaskId;
  const isCharacterRulesPending = characterRulesMutation.isPending || !!characterRulesPollingTaskId;
  const isNovelPending = novelMutation.isPending || !!novelPollingTaskId;

  return {
    outlineMutation,
    volumeOutlineMutation,
    characterRulesMutation,
    novelMutation,

    outlinePollingTaskId, setOutlinePollingTaskId,
    volumeOutlinePollingTaskId, setVolumeOutlinePollingTaskId,
    characterRulesPollingTaskId, setCharacterRulesPollingTaskId,
    novelPollingTaskId, setNovelPollingTaskId,

    polledOutlineTask,
    polledVolumeOutlineTask,
    polledCharacterRulesTask,
    polledNovelTask,

    handleOutlineResult,
    handleVolumeOutlineResult,
    handleCharacterRulesResult,
    handleNovelResult,

    isOutlinePending,
    isVolumeOutlinePending,
    isCharacterRulesPending,
    isNovelPending,
  };
}

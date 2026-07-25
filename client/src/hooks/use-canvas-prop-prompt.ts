'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { useTaskPoll } from '@/hooks/use-task-poll';
import { useCanvasStore } from '@/stores/canvas-store';
import { toast } from '@/hooks/use-toast';

interface PropPromptOptions {
  sceneText: string;
  style?: string;
}

export function useCanvasPropPrompt() {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const taskQuery = useTaskPoll(activeTaskId ?? '', !!activeTaskId);
  const processedRef = useRef(false);

  const createMutation = useMutation({
    mutationFn: (opts: PropPromptOptions) =>
      tasksApi.create({
        workflow_type: 'canvas_generate_prop_prompt',
        input_params: {
          scene_text: opts.sceneText,
          style: opts.style ?? '',
        },
      }),
    onSuccess: (response) => {
      setActiveTaskId(response.data.id);
      processedRef.current = false;
    },
    onError: () => {
      toast({ title: '创建道具提取任务失败', variant: 'destructive' });
    },
  });

  // Handle task completion via useEffect
  useEffect(() => {
    const task = taskQuery.data;
    if (!task || !activeTaskId || processedRef.current) return;

    if (task.status === 'SUCCESS') {
      processedRef.current = true;
      const result = task.result as { raw_inventory?: string; raw_prompts?: string } | undefined;
      const promptText = result?.raw_prompts ?? '';

      if (!promptText.trim()) {
        toast({ title: '道具提取结果为空', variant: 'destructive' });
        setActiveTaskId(null);
        return;
      }

      const store = useCanvasStore.getState();
      const promptLines = promptText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 15 && !l.startsWith('|') && !l.startsWith('#'));

      if (promptLines.length === 0) {
        toast({ title: '未解析到有效道具提示词', variant: 'destructive' });
        setActiveTaskId(null);
        return;
      }

      let createdCount = 0;
      for (const line of promptLines) {
        const cleanPrompt = line.replace(/^\d+[\.、\s\-–—]+/, '').trim();
        if (cleanPrompt.length < 10) continue;

        store.addNode('imageBlock', {
          prompt: cleanPrompt,
          stylePrompt: '',
          label: `道具 ${createdCount + 1}`,
          description: `从剧本提取的道具 ${createdCount + 1}`,
        });
        createdCount++;
      }

      toast({
        title: `道具提取完成`,
        description: `已创建 ${createdCount} 个道具节点`,
      });
      setActiveTaskId(null);
    }

    if (task.status === 'FAILED') {
      processedRef.current = true;
      toast({
        title: '道具提取失败',
        description: task.error_message,
        variant: 'destructive',
      });
      setActiveTaskId(null);
    }
  }, [taskQuery.data, activeTaskId]);

  const generate = useCallback(
    (opts: PropPromptOptions) => {
      createMutation.mutate(opts);
    },
    [createMutation],
  );

  const cancel = useCallback(() => {
    setActiveTaskId(null);
    processedRef.current = false;
  }, []);

  return {
    generate,
    cancel,
    isGenerating: createMutation.isPending || (!!activeTaskId && taskQuery.isFetching),
    activeTaskId,
  };
}

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { useTaskPoll } from '@/hooks/use-task-poll';
import { useCanvasStore } from '@/stores/canvas-store';
import { toast } from '@/hooks/use-toast';
import type { CanvasNodeData, CharacterData, SceneData, ImageBlockData } from '@/types/canvas';

export type NodeGenerateType = 'character' | 'scene' | 'imageBlock';

export interface GenerateOptions {
  nodeId: string;
  nodeType: NodeGenerateType;
  prompt: string;
  stylePrompt?: string;
  model?: string;
  resolution?: string;
  aspectRatio?: string;
  referenceImages?: string[];
}

export function useCanvasGenerate() {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const optsRef = useRef<GenerateOptions | null>(null);

  const taskQuery = useTaskPoll(activeTaskId ?? '', !!activeTaskId);

  const createMutation = useMutation({
    mutationFn: (opts: GenerateOptions) => {
      optsRef.current = opts;
      return tasksApi.create({
        workflow_type: 'canvas_generate_image',
        input_params: {
          prompt: opts.prompt,
          stylePrompt: opts.stylePrompt ?? '',
          model: opts.model ?? '',
          resolution: opts.resolution ?? '2K',
          aspectRatio: opts.aspectRatio ?? '16:9',
          referenceImages: opts.referenceImages ?? [],
          nodeType: opts.nodeType,
        },
      });
    },
    onSuccess: (response) => {
      setActiveTaskId(response.data.id);
    },
    onError: () => {
      toast({ title: '创建生成任务失败', variant: 'destructive' });
    },
  });

  // Apply result when task completes
  useEffect(() => {
    const task = taskQuery.data;
    if (!task || !activeTaskId || !optsRef.current) return;

    if (task.status === 'SUCCESS') {
      const imageUrl = (task.result as Record<string, unknown>)?.image_url as string ?? '';
      if (imageUrl) {
        const { selectedNodeId, applyImageToCharacter, applyImageToScene, updateNodeData } =
          useCanvasStore.getState();
        if (selectedNodeId && optsRef.current.nodeId === selectedNodeId) {
          switch (optsRef.current.nodeType) {
            case 'character':
              applyImageToCharacter(selectedNodeId, imageUrl);
              break;
            case 'scene':
              applyImageToScene(selectedNodeId, imageUrl);
              break;
            case 'imageBlock':
              updateNodeData(selectedNodeId, { imageUrl } as Partial<ImageBlockData>);
              break;
          }
        }
        toast({ title: '图片生成完成' });
      }
      setActiveTaskId(null);
      optsRef.current = null;
    }

    if (task.status === 'FAILED') {
      toast({
        title: '图片生成失败',
        description: task.error_message,
        variant: 'destructive',
      });
      setActiveTaskId(null);
      optsRef.current = null;
    }
  }, [taskQuery.data, activeTaskId]);

  const generate = useCallback(
    (opts: GenerateOptions) => {
      createMutation.mutate(opts);
    },
    [createMutation],
  );

  const cancel = useCallback(() => {
    setActiveTaskId(null);
    optsRef.current = null;
  }, []);

  return {
    generate,
    cancel,
    isGenerating: createMutation.isPending || (!!activeTaskId && taskQuery.isFetching),
    activeTaskId,
  };
}

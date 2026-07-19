'use client';

import { useState, useCallback, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { useTaskPoll } from '@/hooks/use-task-poll';
import { useCanvasStore } from '@/stores/canvas-store';
import { toast } from '@/hooks/use-toast';

interface ScenePromptOptions {
  scriptText: string;
  sceneName: string;
  sceneDescription?: string;
  style?: string;
}

export function useCanvasScenePrompt() {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [imageTaskId, setImageTaskId] = useState<string | null>(null);
  const [targetNodeId, setTargetNodeId] = useState<string | null>(null);
  const [stage, setStage] = useState<'idle' | 'generating_prompt' | 'generating_image' | 'done'>('idle');

  const taskQuery = useTaskPoll(activeTaskId ?? '', !!activeTaskId);
  const imageTaskQuery = useTaskPoll(imageTaskId ?? '', !!imageTaskId);

  const createMutation = useMutation({
    mutationFn: (opts: ScenePromptOptions) =>
      tasksApi.create({
        workflow_type: 'canvas_generate_scene_prompt',
        input_params: {
          script_text: opts.scriptText,
          scene_name: opts.sceneName,
          scene_description: opts.sceneDescription ?? '',
          style: opts.style ?? '',
        },
      }),
    onSuccess: (response) => {
      setActiveTaskId(response.data.id);
      setStage('generating_prompt');
    },
    onError: () => {
      toast({ title: '创建场景提示词任务失败', variant: 'destructive' });
      setStage('idle');
    },
  });

  // Handle scene prompt task completion
  useEffect(() => {
    const task = taskQuery.data;
    if (!task || !activeTaskId || !targetNodeId) return;

    if (task.status === 'SUCCESS') {
      const result = task.result as Record<string, unknown>;
      const prompt = (result.prompt as string) ?? '';
      const stylePrompt = (result.stylePrompt as string) ?? '';
      const aspectRatio = (result.aspectRatio as string) ?? '21:9';

      if (!prompt) {
        toast({ title: '场景提示词生成结果为空', variant: 'destructive' });
        setActiveTaskId(null);
        setTargetNodeId(null);
        setStage('idle');
        return;
      }

      // Update scene node with generated prompt
      const store = useCanvasStore.getState();
      store.updateNodeData(targetNodeId, {
        prompt,
        stylePrompt,
        aspectRatio,
      } as any);

      toast({ title: '场景提示词生成完成，正在生成图片...' });

      // Now trigger image generation
      setActiveTaskId(null);
      setStage('generating_image');

      tasksApi.create({
        workflow_type: 'canvas_generate_image',
        input_params: {
          prompt,
          stylePrompt,
          aspectRatio: '21:9',
          model: '',
          resolution: '2K',
          referenceImages: [],
          nodeType: 'scene',
        },
      }).then((response) => {
        setImageTaskId(response.data.id);
      }).catch(() => {
        toast({ title: '场景图片生成失败', variant: 'destructive' });
        setImageTaskId(null);
        setTargetNodeId(null);
        setStage('idle');
      });
    }

    if (task.status === 'FAILED') {
      toast({
        title: '场景提示词生成失败',
        description: task.error_message,
        variant: 'destructive',
      });
      setActiveTaskId(null);
      setTargetNodeId(null);
      setStage('idle');
    }
  }, [taskQuery.data, activeTaskId, targetNodeId]);

  // Handle image generation task completion
  useEffect(() => {
    const task = imageTaskQuery.data;
    if (!task || !imageTaskId || !targetNodeId) return;

    if (task.status === 'SUCCESS') {
      const imageUrl = (task.result as Record<string, unknown>)?.image_url as string ?? '';
      if (imageUrl) {
        const store = useCanvasStore.getState();
        store.applyImageToScene(targetNodeId, imageUrl);
      }
      toast({ title: '场景图片生成完成' });
      setImageTaskId(null);
      setTargetNodeId(null);
      setStage('done');
    }

    if (task.status === 'FAILED') {
      toast({
        title: '场景图片生成失败',
        description: task.error_message,
        variant: 'destructive',
      });
      setImageTaskId(null);
      setTargetNodeId(null);
      setStage('idle');
    }
  }, [imageTaskQuery.data, imageTaskId, targetNodeId]);

  const generatePrompt = useCallback(
    (nodeId: string, opts: ScenePromptOptions) => {
      setTargetNodeId(nodeId);
      setStage('generating_prompt');
      createMutation.mutate(opts);
    },
    [createMutation],
  );

  const isGenerating = stage === 'generating_prompt' || stage === 'generating_image';

  return {
    generatePrompt,
    isGenerating,
    stage,
  };
}

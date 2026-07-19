'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { useTaskPoll } from '@/hooks/use-task-poll';
import { useCanvasStore } from '@/stores/canvas-store';
import { toast } from '@/hooks/use-toast';

export interface ParseScriptOptions {
  scriptText: string;
  parseType?: 'characters' | 'scenes' | 'all';
  style?: string;
}

export interface ParsedCharacter {
  name: string;
  description: string;
  appearanceCount: number;
  prompt?: string;
  stylePrompt?: string;
}

export interface ParsedScene {
  name: string;
  description: string;
  appearanceCount: number;
}

interface ImageGenQueueItem {
  nodeId: string;
  prompt: string;
  stylePrompt: string;
  nodeType: 'character' | 'scene' | 'imageBlock';
}

export function useCanvasParseScript() {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const optsRef = useRef<ParseScriptOptions | null>(null);

  // Image generation queue state
  const [imageGenQueue, setImageGenQueue] = useState<ImageGenQueueItem[]>([]);
  const [currentImageTaskId, setCurrentImageTaskId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<{ completed: number; total: number } | null>(null);
  const queueIndexRef = useRef(0);

  const taskQuery = useTaskPoll(activeTaskId ?? '', !!activeTaskId);
  const imageTaskQuery = useTaskPoll(currentImageTaskId ?? '', !!currentImageTaskId);

  const createMutation = useMutation({
    mutationFn: (opts: ParseScriptOptions) => {
      optsRef.current = opts;
      return tasksApi.create({
        workflow_type: 'canvas_parse_script',
        input_params: {
          script_text: opts.scriptText,
          parse_type: opts.parseType ?? 'all',
          style: opts.style ?? '',
        },
      });
    },
    onSuccess: (response) => {
      setActiveTaskId(response.data.id);
    },
    onError: () => {
      toast({ title: '创建解析任务失败', variant: 'destructive' });
    },
  });

  // Process next image in queue
  const processNextImage = useCallback(() => {
    const store = useCanvasStore.getState();
    const queue = imageGenQueue;
    const idx = queueIndexRef.current;

    if (idx >= queue.length) {
      // All done
      setCurrentImageTaskId(null);
      setImageGenQueue([]);
      queueIndexRef.current = 0;
      toast({ title: '所有角色图片生成完成' });
      return;
    }

    const item = queue[idx];
    setGenerationProgress({ completed: idx, total: queue.length });

    // Create image generation task for this character
    tasksApi.create({
      workflow_type: 'canvas_generate_image',
      input_params: {
        prompt: item.prompt,
        stylePrompt: item.stylePrompt,
        model: '',
        resolution: '2K',
        aspectRatio: '9:16',
        referenceImages: [],
        nodeType: item.nodeType,
      },
    }).then((response) => {
      setCurrentImageTaskId(response.data.id);
    }).catch(() => {
      toast({ title: `角色 ${item.nodeId} 图片生成失败`, variant: 'destructive' });
      // Continue to next
      queueIndexRef.current += 1;
      processNextImage();
    });
  }, [imageGenQueue]);

  // Handle image task completion
  useEffect(() => {
    const task = imageTaskQuery.data;
    if (!task || !currentImageTaskId) return;

    if (task.status === 'SUCCESS') {
      const imageUrl = (task.result as Record<string, unknown>)?.image_url as string ?? '';
      if (imageUrl) {
        const item = imageGenQueue[queueIndexRef.current];
        if (item) {
          const store = useCanvasStore.getState();
          store.applyImageToCharacter(item.nodeId, imageUrl);
        }
      }
      // Move to next
      queueIndexRef.current += 1;
      setCurrentImageTaskId(null);
      setGenerationProgress({ completed: queueIndexRef.current, total: imageGenQueue.length });
      // Process next after a short delay
      setTimeout(processNextImage, 500);
    }

    if (task.status === 'FAILED') {
      toast({
        title: `角色图片生成失败`,
        description: task.error_message,
        variant: 'destructive',
      });
      // Continue to next
      queueIndexRef.current += 1;
      setCurrentImageTaskId(null);
      setTimeout(processNextImage, 500);
    }
  }, [imageTaskQuery.data, currentImageTaskId, imageGenQueue, processNextImage]);

  // Apply result when parse task completes
  useEffect(() => {
    const task = taskQuery.data;
    if (!task || !activeTaskId || !optsRef.current) return;

    if (task.status === 'SUCCESS') {
      const result = task.result as Record<string, unknown>;
      const characters = result.characters as ParsedCharacter[] | undefined;
      const scenes = result.scenes as ParsedScene[] | undefined;
      const opts = optsRef.current;
      const { addNode } = useCanvasStore.getState();
      let count = 0;
      const createdCharacterInfos: { name: string; prompt: string; stylePrompt: string }[] = [];

      if (characters && characters.length > 0) {
        for (const ch of characters) {
          addNode('character', {
            label: ch.name,
            characterName: ch.name,
            description: ch.description,
            appearanceCount: ch.appearanceCount,
            prompt: ch.prompt ?? '',
            stylePrompt: ch.stylePrompt ?? '',
          });
          createdCharacterInfos.push({
            name: ch.name,
            prompt: ch.prompt ?? '',
            stylePrompt: ch.stylePrompt ?? '',
          });
          count++;
        }
      }

      if (scenes && scenes.length > 0) {
        for (const sc of scenes) {
          addNode('scene', {
            label: sc.name,
            sceneName: sc.name,
            description: sc.description,
            appearanceCount: sc.appearanceCount,
          });
          count++;
        }
      }

      toast({ title: `解析完成，已添加 ${count} 个节点` });
      setActiveTaskId(null);

      // Save script text for later scene prompt regeneration
      if (opts.scriptText) {
        useCanvasStore.getState().setScriptText(opts.scriptText);
      }

      optsRef.current = null;

      // Start image generation for characters that have prompts
      const nodesAfterParse = useCanvasStore.getState().nodes;
      const queue: ImageGenQueueItem[] = [];

      for (const info of createdCharacterInfos) {
        if (!info.prompt) continue;
        // Find the actual node ID from the store by matching characterName
        const node = nodesAfterParse.find(n =>
          (n.data as Record<string, unknown>).characterName === info.name
        );
        if (node) {
          queue.push({
            nodeId: node.id,
            prompt: info.prompt,
            stylePrompt: info.stylePrompt || (opts?.style ?? ''),
            nodeType: 'character',
          });
        }
      }

      if (queue.length > 0) {
        setImageGenQueue(queue);
        queueIndexRef.current = 0;
        setGenerationProgress({ completed: 0, total: queue.length });
        // Start processing
        setTimeout(processNextImage, 1000);
      }
    }

    if (task.status === 'FAILED') {
      toast({
        title: '剧本解析失败',
        description: task.error_message,
        variant: 'destructive',
      });
      setActiveTaskId(null);
      optsRef.current = null;
    }
  }, [taskQuery.data, activeTaskId, processNextImage]);

  const parse = useCallback(
    (opts: ParseScriptOptions) => {
      createMutation.mutate(opts);
    },
    [createMutation],
  );

  const cancel = useCallback(() => {
    setActiveTaskId(null);
    optsRef.current = null;
    setCurrentImageTaskId(null);
    setImageGenQueue([]);
    queueIndexRef.current = 0;
    setGenerationProgress(null);
  }, []);

  const isGeneratingImages = !!generationProgress && generationProgress.total > 0;

  return {
    parse,
    cancel,
    isParsing: createMutation.isPending || (!!activeTaskId && taskQuery.isFetching),
    isGeneratingImages,
    generationProgress,
    activeTaskId,
  };
}

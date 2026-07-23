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
  voiceDescription?: string;
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

interface SceneGenItem {
  nodeId: string;
  sceneName: string;
  description: string;
  scriptText: string;
  style: string;
}

/** Poll a task until SUCCESS or FAILED */
function pollTask(taskId: string, maxAttempts = 30, interval = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const iv = setInterval(async () => {
      attempts++;
      try {
        const resp = await tasksApi.get(taskId);
        const task = resp.data;
        if (task.status === 'SUCCESS') {
          clearInterval(iv);
          resolve(task.result);
        } else if (task.status === 'FAILED') {
          clearInterval(iv);
          reject(new Error(task.error_message || 'Task failed'));
        }
      } catch {
        // ignore network errors, keep polling
      }
      if (attempts >= maxAttempts) {
        clearInterval(iv);
        reject(new Error('Polling timeout'));
      }
    }, interval);
  });
}

export function useCanvasParseScript() {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const optsRef = useRef<ParseScriptOptions | null>(null);

  // Image generation queue state (ref to avoid stale closures in setTimeout callbacks)
  const imageGenRef = useRef<{ queue: ImageGenQueueItem[]; index: number }>({ queue: [], index: 0 });
  const [currentImageTaskId, setCurrentImageTaskId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<{ completed: number; total: number } | null>(null);

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
    const gen = imageGenRef.current;
    const queue = gen.queue;
    const idx = gen.index;

    if (idx >= queue.length) {
      // All done
      setCurrentImageTaskId(null);
      imageGenRef.current = { queue: [], index: 0 };
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
      imageGenRef.current = { queue, index: idx + 1 };
      processNextImage();
    });
  }, []);

  // Process scene queue: scene prompt -> image generation, sequentially
  const processSceneQueue = useCallback(async (sceneQueue: SceneGenItem[]) => {
    const total = sceneQueue.length;
    for (let i = 0; i < total; i++) {
      const item = sceneQueue[i];
      setGenerationProgress({ completed: i, total });
      try {
        // Step 1: generate scene prompt via LLM
        const promptResp = await tasksApi.create({
          workflow_type: 'canvas_generate_scene_prompt',
          input_params: {
            script_text: item.scriptText,
            scene_name: item.sceneName,
            scene_description: item.description,
            style: item.style,
          },
        });
        const promptResult = await pollTask(promptResp.data.id);
        const prompt = (promptResult as any)?.prompt ?? '';
        const stylePrompt = (promptResult as any)?.stylePrompt ?? item.style;
        if (!prompt) {
          toast({ title: `场景「${item.sceneName}」提示词生成失败`, variant: 'destructive' });
          continue;
        }
        // Update node with prompt data
        const store = useCanvasStore.getState();
        store.updateNodeData(item.nodeId, { prompt, stylePrompt, aspectRatio: '21:9' } as any);

        // Step 2: generate image from prompt
        const imgResp = await tasksApi.create({
          workflow_type: 'canvas_generate_image',
          input_params: {
            prompt,
            stylePrompt,
            model: '',
            resolution: '2K',
            aspectRatio: '21:9',
            referenceImages: [],
            nodeType: 'scene',
          },
        });
        const imgResult = await pollTask(imgResp.data.id);
        const imageUrl = (imgResult as any)?.image_url ?? '';
        if (imageUrl) {
          store.applyImageToScene(item.nodeId, imageUrl);
        }
        toast({ title: `场景「${item.sceneName}」图片生成完成` });
      } catch (err: any) {
        toast({
          title: `场景「${item.sceneName}」生成失败`,
          description: err?.message ?? '未知错误',
          variant: 'destructive',
        });
      }
    }
    setGenerationProgress(null);
  }, []);

  // Handle image task completion
  useEffect(() => {
    const task = imageTaskQuery.data;
    if (!task || !currentImageTaskId) return;

    if (task.status === 'SUCCESS') {
      const imageUrl = (task.result as Record<string, unknown>)?.image_url as string ?? '';
      if (imageUrl) {
        const gen = imageGenRef.current;
        const item = gen.queue[gen.index];
        if (item) {
          const store = useCanvasStore.getState();
          store.applyImageToCharacter(item.nodeId, imageUrl);
        }
      }
      // Move to next
      imageGenRef.current = { ...imageGenRef.current, index: imageGenRef.current.index + 1 };
      setCurrentImageTaskId(null);
      setGenerationProgress({ completed: imageGenRef.current.index, total: imageGenRef.current.queue.length });
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
      imageGenRef.current = { ...imageGenRef.current, index: imageGenRef.current.index + 1 };
      setCurrentImageTaskId(null);
      setTimeout(processNextImage, 500);
    }
  }, [imageTaskQuery.data, currentImageTaskId, processNextImage]);

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
      const createdCharacterInfos: { name: string; prompt: string; stylePrompt: string; voiceDescription?: string }[] = [];

      if (characters && characters.length > 0) {
        for (const ch of characters) {
          addNode('character', {
            label: ch.name,
            characterName: ch.name,
            description: ch.description,
            appearanceCount: ch.appearanceCount,
            prompt: ch.prompt ?? '',
            stylePrompt: ch.stylePrompt ?? '',
            voiceDescription: ch.voiceDescription ?? '',
          });
          createdCharacterInfos.push({
            name: ch.name,
            prompt: ch.prompt ?? '',
            stylePrompt: ch.stylePrompt ?? '',
            voiceDescription: ch.voiceDescription,
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
      const charQueue: ImageGenQueueItem[] = [];

      for (const info of createdCharacterInfos) {
        if (!info.prompt) continue;
        const node = nodesAfterParse.find(n =>
          (n.data as Record<string, unknown>).characterName === info.name
        );
        if (node) {
          charQueue.push({
            nodeId: node.id,
            prompt: info.prompt,
            stylePrompt: info.stylePrompt || (opts?.style ?? ''),
            nodeType: 'character',
          });
        }
      }

      // Build scene queue
      const sceneQueue: SceneGenItem[] = [];
      if (scenes && scenes.length > 0 && opts.scriptText) {
        for (const sc of scenes) {
          const node = nodesAfterParse.find(n =>
            (n.data as Record<string, unknown>).sceneName === sc.name
          );
          if (node) {
            sceneQueue.push({
              nodeId: node.id,
              sceneName: sc.name,
              description: sc.description,
              scriptText: opts.scriptText,
              style: opts.style ?? '',
            });
          }
        }
      }

      const startedImages = charQueue.length > 0;
      const startedScenes = sceneQueue.length > 0;

      // Start character image queue
      if (charQueue.length > 0) {
        imageGenRef.current = { queue: charQueue, index: 0 };
        setGenerationProgress({ completed: 0, total: charQueue.length });
        setTimeout(processNextImage, 1000);
      }

      // Start scene prompt+image queue (async, fire-and-forget)
      if (sceneQueue.length > 0) {
        processSceneQueue(sceneQueue);
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
    imageGenRef.current = { queue: [], index: 0 };
    setGenerationProgress(null);
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

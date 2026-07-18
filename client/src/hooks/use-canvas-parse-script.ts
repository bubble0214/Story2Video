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
}

export interface ParsedCharacter {
  name: string;
  description: string;
  appearanceCount: number;
}

export interface ParsedScene {
  name: string;
  description: string;
  appearanceCount: number;
}

export function useCanvasParseScript() {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const optsRef = useRef<ParseScriptOptions | null>(null);

  const taskQuery = useTaskPoll(activeTaskId ?? '', !!activeTaskId);

  const createMutation = useMutation({
    mutationFn: (opts: ParseScriptOptions) => {
      optsRef.current = opts;
      return tasksApi.create({
        workflow_type: 'canvas_parse_script',
        input_params: {
          script_text: opts.scriptText,
          parse_type: opts.parseType ?? 'all',
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

  // Apply result when task completes
  useEffect(() => {
    const task = taskQuery.data;
    if (!task || !activeTaskId || !optsRef.current) return;

    if (task.status === 'SUCCESS') {
      const result = task.result as Record<string, unknown>;
      const characters = result.characters as ParsedCharacter[] | undefined;
      const scenes = result.scenes as ParsedScene[] | undefined;
      const { addNode } = useCanvasStore.getState();
      let count = 0;

      if (characters && characters.length > 0) {
        for (const ch of characters) {
          addNode('character', {
            label: ch.name,
            characterName: ch.name,
            description: ch.description,
            appearanceCount: ch.appearanceCount,
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
      optsRef.current = null;
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
  }, [taskQuery.data, activeTaskId]);

  const parse = useCallback(
    (opts: ParseScriptOptions) => {
      createMutation.mutate(opts);
    },
    [createMutation],
  );

  const cancel = useCallback(() => {
    setActiveTaskId(null);
    optsRef.current = null;
  }, []);

  return {
    parse,
    cancel,
    isParsing: createMutation.isPending || (!!activeTaskId && taskQuery.isFetching),
    activeTaskId,
  };
}

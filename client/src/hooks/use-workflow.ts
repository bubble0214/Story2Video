'use client';

import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { useWorkflowStore } from '@/stores/workflow-store';
import { WORKFLOW_TYPE_TO_MODE } from '@/types/workflow';
import { toast } from '@/hooks/use-toast';
import type { WorkflowType } from '@/types/task';

export function useWorkflow() {
  const router = useRouter();
  const store = useWorkflowStore();

  const nextStepOrder: WorkflowType[] = [
    'generate_script',
    'generate_lyrics',
    'generate_song',
    'generate_image',
    'generate_video',
  ];

  const createTaskMutation = useMutation({
    mutationFn: ({
      workflowType,
      model,
    }: {
      workflowType: WorkflowType;
      model?: string;
    }) => {
      const inputParams: Record<string, unknown> = {
        keywords: store.keywords,
        novel_id: store.selectedNovelId,
      };
      if (model) {
        inputParams.model = model;
      }
      return tasksApi.create({
        workflow_type: workflowType,
        input_params: inputParams,
      });
    },
    onSuccess: ({ data }) => {
      store.setCurrentTaskId(data.id);
      router.push(`/task/${data.id}`);
    },
    onError: () => {
      toast({
        title: 'Failed to create task',
        variant: 'destructive',
      });
    },
  });

  const startWorkflow = (model?: string) => {
    if (!store.keywords.trim()) {
      toast({ title: 'Please enter keywords first', variant: 'destructive' });
      return;
    }
    createTaskMutation.mutate({ workflowType: store.getWorkflowType(), model });
  };

  const goToNextStep = (currentWorkflowType: string) => {
    const currentIndex = nextStepOrder.indexOf(currentWorkflowType as WorkflowType);
    if (currentIndex < nextStepOrder.length - 1) {
      const next = nextStepOrder[currentIndex + 1];
      store.addCompletedStep(currentWorkflowType as WorkflowType);
      // Navigate to the workflow page instead of auto-creating a task
      const mode = WORKFLOW_TYPE_TO_MODE[next] || next.replace('generate_', '');
      router.push(`/workflow/${mode}`);
    } else {
      store.addCompletedStep(currentWorkflowType as WorkflowType);
      toast({ title: 'Workflow complete! All steps finished.' });
    }
  };

  return {
    store,
    setKeywords: store.setKeywords,
    setWorkflowMode: store.setWorkflowMode,
    setSelectedNovel: store.setSelectedNovel,
    startWorkflow,
    goToNextStep,
    createTaskMutation,
  };
}

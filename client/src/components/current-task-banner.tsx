'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { useWorkflowStore } from '@/stores/workflow-store';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';

export function CurrentTaskBanner() {
  const router = useRouter();
  const currentTaskId = useWorkflowStore((s) => s.currentTaskId);

  const { data: task } = useQuery({
    queryKey: ['current-task', currentTaskId],
    queryFn: async () => {
      if (!currentTaskId) return null;
      const { data } = await tasksApi.get(currentTaskId);
      return data;
    },
    enabled: !!currentTaskId,
    refetchInterval: currentTaskId ? 3000 : false,
  });

  if (!currentTaskId || !task) return null;

  const status = task.status;
  const isRunning = status === 'PENDING' || status === 'RUNNING';
  const isSuccess = status === 'SUCCESS';
  const isFailed = status === 'FAILED';

  return (
    <div
      className={`rounded-lg border p-4 flex items-center justify-between gap-3 ${
        isRunning ? 'border-blue-500/30 bg-blue-500/5' :
        isSuccess ? 'border-green-500/30 bg-green-500/5' :
        'border-red-500/30 bg-red-500/5'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {isRunning && <Loader2 className="h-5 w-5 text-blue-500 animate-spin shrink-0" />}
        {isSuccess && <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />}
        {isFailed && <XCircle className="h-5 w-5 text-red-500 shrink-0" />}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {isRunning && 'Task in progress...'}
            {isSuccess && 'Task completed!'}
            {isFailed && 'Task failed'}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {isRunning && task.current_step ? `Step: ${task.current_step}` : `Status: ${status}`}
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => router.push(`/task/${currentTaskId}`)}
      >
        View Progress
        <ArrowRight className="h-3 w-3 ml-1" />
      </Button>
    </div>
  );
}

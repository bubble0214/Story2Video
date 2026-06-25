'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { useWorkflowStore } from '@/stores/workflow-store';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';

interface CurrentTaskBannerProps {
  compact?: boolean;
}

export function CurrentTaskBanner({ compact }: CurrentTaskBannerProps) {
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
      className={`rounded-lg border ${
        compact ? 'p-2 mx-2' : 'p-4'
      } flex items-center justify-between gap-2 ${
        isRunning ? 'border-blue-500/30 bg-blue-500/5' :
        isSuccess ? 'border-green-500/30 bg-green-500/5' :
        'border-red-500/30 bg-red-500/5'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isRunning && <Loader2 className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} text-blue-500 animate-spin shrink-0`} />}
        {isSuccess && <CheckCircle2 className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} text-green-500 shrink-0`} />}
        {isFailed && <XCircle className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} text-red-500 shrink-0`} />}
        <div className="min-w-0">
          <p className={`${compact ? 'text-xs' : 'text-sm'} font-medium truncate`}>
            {isRunning && '任务进行中...'}
            {isSuccess && '任务已完成！'}
            {isFailed && '任务失败'}
          </p>
          <p className={`${compact ? 'text-[10px]' : 'text-xs'} text-muted-foreground truncate`}>
            {isRunning && task.current_step ? `步骤: ${task.current_step}` : `状态: ${status}`}
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className={`shrink-0 ${compact ? 'h-6 text-[10px] px-2' : ''}`}
        onClick={() => router.push(`/task/${currentTaskId}`)}
      >
        查看进度
        <ArrowRight className={`${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} ml-1`} />
      </Button>
    </div>
  );
}

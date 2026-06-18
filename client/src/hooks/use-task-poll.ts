'use client';

import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import type { TaskResp } from '@/types/task';

export function useTaskPoll(taskId: string, enabled = true) {
  return useQuery<TaskResp>({
    queryKey: ['task', taskId],
    queryFn: async () => {
      const { data } = await tasksApi.get(taskId);
      return data;
    },
    enabled,
    refetchInterval: (query) => {
      const task = query.state.data;
      if (!task || task.status === 'SUCCESS' || task.status === 'FAILED') {
        return false;
      }
      return 3000;
    },
    staleTime: 2000,
  });
}

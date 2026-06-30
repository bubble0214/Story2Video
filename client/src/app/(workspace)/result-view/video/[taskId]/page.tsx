'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { Button } from '@/components/ui/button';
import { VideoTab } from '@/features/result/video-tab';
import { Loader2 } from 'lucide-react';

export default function VideoViewPage() {
  const params = useParams<{ taskId: string }>();
  const router = useRouter();
  const taskId = params?.taskId;

  const { data: task, isLoading, isError, error } = useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => {
      const { data } = await tasksApi.get(taskId!);
      return data;
    },
    enabled: !!taskId,
  });

  if (!taskId) {
    return (
      <div className="container max-w-md mx-auto py-12 px-4 text-center">
        <p className="text-muted-foreground mb-4">未提供任务 ID。</p>
        <Button onClick={() => router.push('/')}>返回首页</Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container max-w-2xl mx-auto py-12 px-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-6">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中...
        </div>
        <div className="h-48 rounded-lg border bg-muted animate-pulse" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container max-w-md mx-auto py-12 px-4 text-center">
        <p className="text-destructive mb-2">
          加载失败: {(error as Error)?.message}
        </p>
        <Button variant="outline" onClick={() => router.refresh()}>重试</Button>
      </div>
    );
  }

  if (!task || task.status !== 'SUCCESS') {
    return (
      <div className="container max-w-md mx-auto py-12 px-4 text-center">
        <p className="text-muted-foreground mb-4">
          {task?.status === 'FAILED' ? `任务失败: ${task.error_message}` : '任务尚未完成。'}
        </p>
        <Button onClick={() => router.push('/')}>返回首页</Button>
      </div>
    );
  }

  const result = task.result;

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">视频</h1>
        <Button variant="outline" onClick={() => router.push('/assets/video')}>返回资产</Button>
      </div>
      <VideoTab videoUrl={result.video_url as string | null} />
    </div>
  );
}

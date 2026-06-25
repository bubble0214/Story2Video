'use client';

import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import type { TaskResp } from '@/types/task';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { WORKFLOW_TYPE_TO_MODE } from '@/types/workflow';
import { PenLine, FileText, Music, Image, Video, Trash2, type LucideIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const MODE_ICONS: Record<string, LucideIcon> = {
  novel: PenLine,
  script: FileText,
  lyrics: FileText,
  song: Music,
  image: Image,
  video: Video,
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  SUCCESS: 'default',
  RUNNING: 'secondary',
  PENDING: 'outline',
  FAILED: 'destructive',
};

interface MyProjectsProps {
  workflowType?: string;
}

export function MyProjects({ workflowType }: MyProjectsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: workflowType ? ['my-tasks', workflowType] : ['my-tasks'],
    queryFn: async () => {
      const { data } = await tasksApi.list({ limit: 10, workflow_type: workflowType });
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tasksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      toast({ title: '项目已删除' });
    },
    onError: (err) => {
      const error = err as { response?: { data?: { detail?: string } }; message?: string };
      toast({
        title: '删除项目失败',
        description: error.response?.data?.detail || error.message,
        variant: 'destructive',
      });
    },
  });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">我的项目</h2>
        {data && data.total > 0 && (
          <Button variant="link" size="sm" asChild>
            <Link href="/">查看全部</Link>
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="h-4 w-24 bg-muted rounded animate-pulse mb-2" />
                <div className="h-3 w-32 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-destructive text-sm mb-2">
              加载项目失败: {(error as Error)?.message}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              重试
            </Button>
          </CardContent>
        </Card>
      )}

      {data && data.items.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center py-8">
            <p className="text-muted-foreground text-sm mb-3">
              暂无项目。从上方开始生成内容吧！
            </p>
            <p className="text-xs text-muted-foreground">
              你已完成的小说、剧本、歌词、歌曲、图片和视频将出现在这里。
            </p>
          </CardContent>
        </Card>
      )}

      {data && data.items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.items.map((task: TaskResp) => {
            const mode = WORKFLOW_TYPE_TO_MODE[task.workflow_type] ?? 'novel';
            const Icon = MODE_ICONS[mode] ?? PenLine;
            const statusLabel =
              task.status === 'SUCCESS' ? '成功' :
              task.status === 'FAILED' ? '失败' :
              task.status === 'RUNNING' ? '运行中' : '等待中';

            return (
              <div key={task.id} className="relative group">
                <Link
                  href={
                    task.status === 'SUCCESS'
                      ? `/result/${task.id}`
                      : `/task/${task.id}`
                  }
                >
                  <Card className="cursor-pointer hover:border-primary/50 transition-colors h-full">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="text-sm font-medium capitalize truncate">
                            {mode === 'novel' ? '小说' : mode === 'script' ? '剧本' : mode === 'lyrics' ? '歌词' : mode === 'song' ? '歌曲' : mode === 'image' ? '图片' : '视频'}
                          </span>
                        </div>
                        <Badge
                          variant={STATUS_VARIANT[task.status] ?? 'outline'}
                          className="shrink-0"
                        >
                          {statusLabel}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(task.created_at).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.preventDefault();
                    deleteMutation.mutate(task.id);
                  }}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

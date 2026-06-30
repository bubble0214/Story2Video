'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { draftsApi } from '@/services/drafts';
import { WORKFLOW_MODE_TO_TYPE, WORKFLOW_TYPE_TO_MODE } from '@/types/workflow';
import { Button } from '@/components/ui/button';
import { PenLine, FileText, Music, Image, Video, ArrowLeft, Trash2, Plus, type LucideIcon } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { TaskResp } from '@/types/task';
import type { DraftListItem } from '@/types/draft';

const MODE_LABELS: Record<string, string> = {
  novel: '小说',
  script: '剧本',
  lyrics: '歌词',
  song: '歌曲',
  image: '图片',
  video: '视频',
};

const MODE_ICONS: Record<string, LucideIcon> = {
  novel: PenLine,
  script: FileText,
  lyrics: FileText,
  song: Music,
  image: Image,
  video: Video,
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function getStepLabel(draft: DraftListItem): string {
  return draft.status === 'in_progress' ? '进行中' : '已完成';
}

export default function AssetCategoryPage() {
  const router = useRouter();
  const params = useParams();
  const mode = params.mode as string;
  const label = MODE_LABELS[mode] ?? mode;
  const Icon = MODE_ICONS[mode] ?? PenLine;
  const workflowType = WORKFLOW_MODE_TO_TYPE[mode as keyof typeof WORKFLOW_MODE_TO_TYPE];
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['asset-category', mode],
    queryFn: async () => {
      const response = await tasksApi.list({ workflow_type: workflowType, limit: 50 });
      return response.data;
    },
  });

  const successItems = data?.items.filter((t: TaskResp) => t.status === 'SUCCESS' && t.workflow_type === workflowType) ?? [];

  // ── Drafts for all modes ──
  const { data: draftsData } = useQuery({
    queryKey: ['drafts', mode],
    queryFn: async () => {
      const response = await draftsApi.list({ limit: 50, workflow_type: mode });
      return response.data;
    },
    enabled: !!mode,
  });
  const drafts: DraftListItem[] = draftsData ?? [];

  const inProgressDrafts = useMemo(() => {
    const filtered = drafts
      .filter((d) => d.status === 'in_progress')
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    // Group by draft_group_id, show only latest per group.
    // Drafts with the same title but null group_id are also grouped.
    const groups = new Map<string, DraftListItem[]>();
    for (const draft of filtered) {
      const key = draft.draft_group_id ?? (draft.title?.trim()?.toLowerCase() || draft.id);
      const group = groups.get(key) ?? [];
      group.push(draft);
      groups.set(key, group);
    }
    const result: DraftListItem[] = [];
    for (const [, group] of groups) {
      result.push(group[0]);
    }
    return result.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [drafts]);

  const deleteDraftMutation = useMutation({
    mutationFn: (id: string) => draftsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts', mode] });
      toast({ title: '草稿已删除' });
    },
    onError: (error) => {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      toast({ title: '删除失败', description: err.response?.data?.detail || err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => tasksApi.delete(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-category', mode] });
      toast({ title: '项目已删除' });
    },
    onError: (error) => {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      toast({ title: '删除失败', description: err.response?.data?.detail || err.message, variant: 'destructive' });
    },
  });

  return (
    <div className="container max-w-3xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Link
          href="/assets"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          资产
        </Link>
        <div className="flex items-center gap-3">
          <Icon className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{label}</h1>
            <p className="text-muted-foreground mt-1">
              浏览已生成的{label}
            </p>
          </div>
          <Button
            className="ml-auto shrink-0"
            onClick={() => {
              // Clear session storage so the workflow page creates a fresh draft
              try { sessionStorage.removeItem(`active_draft_${mode}`); } catch {}
              router.push(`/workflow/${mode}`);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            新建{label}
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && !isLoading && (
        <div className="text-center py-12 space-y-3">
          <p className="text-muted-foreground">加载{label}失败</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            重试
          </Button>
        </div>
      )}

      {/* In-progress drafts */}
      {!isLoading && inProgressDrafts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">进行中的{label}</h2>
          <div className="space-y-2">
            {inProgressDrafts.map((draft) => (
              <div
                key={draft.id}
                className="group flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 hover:bg-primary/10 transition-colors"
              >
                <Link
                  href={`/workflow/${WORKFLOW_TYPE_TO_MODE[draft.workflow_type] ?? draft.workflow_type}?draft=${draft.id}`}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <Icon className="h-5 w-5 shrink-0 text-primary" />
                  <span className="flex-1 truncate font-medium">{draft.title}</span>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full shrink-0">
                    {getStepLabel(draft)}
                  </span>
                  <span className="text-sm text-muted-foreground shrink-0">
                    {formatDate(draft.updated_at)}
                  </span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (confirm('确定要删除这个草稿吗？')) {
                      deleteDraftMutation.mutate(draft.id);
                    }
                  }}
                  disabled={deleteDraftMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed drafts */}
      {!isLoading && drafts.filter((d) => d.status === 'completed').length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">已完成</h2>
          <div className="space-y-2">
            {drafts.filter((d) => d.status === 'completed').map((draft) => (
              <div
                key={draft.id}
                className="group flex items-center gap-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors"
              >
                <Link
                  href={`/workflow/${WORKFLOW_TYPE_TO_MODE[draft.workflow_type] ?? draft.workflow_type}?draft=${draft.id}`}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate font-medium">{draft.title}</span>
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full shrink-0">
                    {getStepLabel(draft)}
                  </span>
                  <span className="text-sm text-muted-foreground shrink-0">
                    {formatDate(draft.updated_at)}
                  </span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (confirm('确定要删除这个草稿吗？')) {
                      deleteDraftMutation.mutate(draft.id);
                    }
                  }}
                  disabled={deleteDraftMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && successItems.length === 0 && drafts.length === 0 && (
        <div className="text-center py-12 space-y-3">
          <p className="text-muted-foreground">
            还没有生成{label}
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/workflow/${mode}`}>
              去生成{label}
            </Link>
          </Button>
        </div>
      )}

      {/* Task list (completed assets) */}
      {!isLoading && !isError && successItems.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight">已生成的{label}</h2>
          {successItems.map((task: TaskResp) => {
            const title = (task.result?.title as string) ?? task.workflow_type.replace('generate_', '');
            return (
              <div
                key={task.id}
                className="group flex items-center gap-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors"
              >
                <Link
                  href={`/result-view/${WORKFLOW_TYPE_TO_MODE[task.workflow_type as keyof typeof WORKFLOW_TYPE_TO_MODE] || mode}/${task.id}`}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate font-medium">{title}</span>
                  <span className="text-sm text-muted-foreground shrink-0">
                    {formatDate(task.created_at)}
                  </span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (confirm('确定要删除这个项目吗？')) {
                      deleteMutation.mutate(task.id);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { WORKFLOW_MODE_TO_TYPE } from '@/types/workflow';
import { Button } from '@/components/ui/button';
import { PenLine, FileText, Music, Image, Video, ArrowLeft, type LucideIcon } from 'lucide-react';
import type { TaskResp } from '@/types/task';

const MODE_LABELS: Record<string, string> = {
  novel: 'Novels',
  script: 'Scripts',
  lyrics: 'Lyrics',
  song: 'Songs',
  image: 'Images',
  video: 'Videos',
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

export default function AssetCategoryPage() {
  const params = useParams();
  const mode = params.mode as string;
  const label = MODE_LABELS[mode] ?? mode;
  const Icon = MODE_ICONS[mode] ?? PenLine;
  const workflowType = WORKFLOW_MODE_TO_TYPE[mode as keyof typeof WORKFLOW_MODE_TO_TYPE];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['asset-category', mode],
    queryFn: async () => {
      console.log(`[asset-category] mode=${mode} workflowType=${workflowType}`);
      const response = await tasksApi.list({ workflow_type: workflowType, limit: 50 });
      console.log(`[asset-category] response items count=${response.data?.items?.length}`, response.data?.items);
      return response.data;
    },
  });

  const successItems = data?.items.filter((t: TaskResp) => t.status === 'SUCCESS' && t.workflow_type === workflowType) ?? [];

  return (
    <div className="container max-w-3xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Link
          href="/assets"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Assets
        </Link>
        <div className="flex items-center gap-3">
          <Icon className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{label}</h1>
            <p className="text-muted-foreground mt-1">
              Browse your generated {mode} projects
            </p>
          </div>
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
          <p className="text-muted-foreground">Failed to load {label.toLowerCase()}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && successItems.length === 0 && (
        <div className="text-center py-12 space-y-3">
          <p className="text-muted-foreground">
            No {mode === 'novel' ? 'novels' : mode === 'script' ? 'scripts' : mode === 'lyrics' ? 'lyrics' : mode}s generated yet
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link href={mode === 'novel' ? '/workflow/novel' : `/workflow/${mode}`}>
              Go to {mode === 'novel' ? 'Novel' : mode} Generation
            </Link>
          </Button>
        </div>
      )}

      {/* Task list */}
      {!isLoading && !isError && successItems.length > 0 && (
        <div className="space-y-2">
          {successItems.map((task: TaskResp) => {
            const title = (task.result?.title as string) ?? task.workflow_type.replace('generate_', '');
            return (
              <Link
                key={task.id}
                href={`/result/${task.id}`}
                className="flex items-center gap-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors"
              >
                <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate font-medium">{title}</span>
                <span className="text-sm text-muted-foreground shrink-0">
                  {formatDate(task.created_at)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

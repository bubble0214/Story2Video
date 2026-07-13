'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { WORKFLOW_TYPE_TO_MODE } from '@/types/workflow';
import { PenLine, FileText, Music, Image, Video, Clapperboard, type LucideIcon } from 'lucide-react';
import type { TaskResp } from '@/types/task';

function extractTitle(task: TaskResp): string {
  const lyricsContent = task.result?.lyrics_content;
  if (typeof lyricsContent === 'string') {
    const match = lyricsContent.match(/【歌曲名称】(.+?)(?:\n|$)/);
    if (match) return match[1].trim();
  }
  return (task.result?.title as string) ?? task.workflow_type.replace('generate_', '');
}

const MODE_ICONS: Record<string, LucideIcon> = {
  novel: PenLine,
  script: FileText,
  lyrics: FileText,
  song: Music,
  image: Image,
  video: Video,
  mv: Clapperboard,
};

export function RecentProjects() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sidebar-recent-tasks'],
    queryFn: async () => {
      const { data } = await tasksApi.list({ limit: 5 });
      return data;
    },
    refetchInterval: 30_000,
  });

  const successItems = data?.items.filter((t: TaskResp) => t.status === 'SUCCESS') ?? [];

  if (isLoading) {
    return (
      <div className="px-3 py-2 space-y-2">
        <div className="h-3 w-16 bg-muted rounded animate-pulse" />
        <div className="h-3 w-24 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (isError || successItems.length === 0) {
    return null;
  }

  return (
    <div className="border-t">
      <div className="px-3 pt-2 pb-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          最近
        </p>
      </div>
      <div className="px-1 pb-1 space-y-0.5">
        {successItems.map((task: TaskResp) => {
          const mode = WORKFLOW_TYPE_TO_MODE[task.workflow_type] ?? 'novel';
          const Icon = MODE_ICONS[mode] ?? PenLine;
          const title = extractTitle(task);

          return (
            <Link
              key={task.id}
              href={`/result-view/${mode}/${task.id}`}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted transition-colors"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate text-muted-foreground">{title}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

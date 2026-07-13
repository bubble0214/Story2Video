'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { WORKFLOW_TYPE_TO_MODE } from '@/types/workflow';
import { Card, CardContent } from '@/components/ui/card';
import { PenLine, FileText, Music, Image, Video, Clapperboard, ArrowRight, type LucideIcon } from 'lucide-react';
import type { TaskResp } from '@/types/task';

const WORKFLOW_LINKS: { mode: string; label: string; Icon: LucideIcon; href: string }[] = [
  { mode: 'novel', label: '小说', Icon: PenLine, href: '/workflow/novel' },
  { mode: 'script', label: '剧本', Icon: FileText, href: '/workflow/script' },
  { mode: 'lyrics', label: '歌曲', Icon: Music, href: '/workflow/song' },
  { mode: 'image', label: '图片', Icon: Image, href: '/workflow/image' },
  { mode: 'mv', label: 'MV', Icon: Clapperboard, href: '/workflow/mv' },
  { mode: 'video', label: '视频', Icon: Video, href: '/workflow/video' },
];

const MODE_ICONS: Record<string, LucideIcon> = {
  novel: PenLine,
  script: FileText,
  lyrics: Music,
  image: Image,
  mv: Clapperboard,
  video: Video,
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function extractTitle(task: TaskResp): string {
  const lyricsContent = task.result?.lyrics_content;
  if (typeof lyricsContent === 'string') {
    const match = lyricsContent.match(/【歌曲名称】(.+?)(?:\n|$)/);
    if (match) return match[1].trim();
  }
  return (task.result?.title as string) ?? task.workflow_type.replace('generate_', '');
}

export default function HomePage() {
  const { data } = useQuery({
    queryKey: ['home-recent-tasks'],
    queryFn: async () => {
      const { data } = await tasksApi.list({ limit: 5 });
      return data;
    },
    refetchInterval: 30_000,
  });

  const recentItems = data?.items.filter((t: TaskResp) => t.status === 'SUCCESS') ?? [];

  return (
    <div className="py-8 px-4 max-w-4xl mx-auto space-y-10">
      {/* Welcome */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Story2Video</h1>
        <p className="text-muted-foreground mt-1">
          AI 驱动的故事与内容创作平台
        </p>
      </div>

      {/* Workflow Quick Access */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">工作流</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {WORKFLOW_LINKS.map((item) => {
            const Icon = item.Icon;
            return (
              <Link key={item.mode} href={item.href}>
                <Card className="cursor-pointer hover:border-primary/50 transition-colors h-full">
                  <CardContent className="flex items-center gap-3 pt-4 pb-4">
                    <Icon className="h-8 w-8 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        生成{item.mode === 'novel' ? '小说' : item.mode === 'script' ? '剧本' : item.mode === 'script-gen' ? '脚本' : item.mode === 'lyrics' ? '歌曲' : item.mode === 'image' ? '图片' : item.mode === 'mv' ? 'MV' : '视频'}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Recent Projects */}
      {recentItems.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">最近项目</h2>
            <Link href="/assets" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              查看全部
            </Link>
          </div>
          <div className="space-y-2">
            {recentItems.map((task: TaskResp) => {
              const mode = WORKFLOW_TYPE_TO_MODE[task.workflow_type] ?? 'novel';
              const Icon = MODE_ICONS[mode] ?? PenLine;
              const title = extractTitle(task);

              return (
                <Link
                  key={task.id}
                  href={`/result-view/${mode}/${task.id}`}
                  className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
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
        </div>
      )}
    </div>
  );
}

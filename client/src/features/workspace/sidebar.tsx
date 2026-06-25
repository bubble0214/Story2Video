'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWorkflowStore } from '@/stores/workflow-store';
import { CurrentTaskBanner } from '@/components/current-task-banner';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  PenLine,
  FileText,
  Music,
  Image,
  Video,
  PenTool,
  FolderOpen,
  type LucideIcon,
} from 'lucide-react';
import { RecentProjects } from './recent-projects';

interface SidebarItem {
  mode: string;
  label: string;
  Icon: LucideIcon;
}

const WORKFLOW_ITEMS: SidebarItem[] = [
  { mode: 'novel', label: '小说', Icon: PenLine },
  { mode: 'script', label: '剧本', Icon: FileText },
  { mode: 'lyrics', label: '歌词', Icon: FileText },
  { mode: 'song', label: '歌曲', Icon: Music },
  { mode: 'image', label: '图片', Icon: Image },
  { mode: 'video', label: '视频', Icon: Video },
];

const WORKFLOW_PATHS: Record<string, string> = {
  novel: '/workflow/novel',
  script: '/workflow/script',
  lyrics: '/workflow/lyrics',
  song: '/workflow/song',
  image: '/workflow/image',
  video: '/workflow/video',
};

export function Sidebar() {
  const router = useRouter();
  const setWorkflowMode = useWorkflowStore((s) => s.setWorkflowMode);

  const handleWorkflowClick = (mode: string) => {
    setWorkflowMode(mode as Parameters<typeof setWorkflowMode>[0]);
    router.push(WORKFLOW_PATHS[mode]);
  };

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-1 p-3">
        {/* Workflow Section */}
        <div className="space-y-1">
          <p className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            工作流
          </p>
          {WORKFLOW_ITEMS.map((item) => (
            <Button
              key={item.mode}
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => handleWorkflowClick(item.mode)}
            >
              <item.Icon className="h-4 w-4" />
              {item.label}
            </Button>
          ))}
        </div>

        {/* Divider */}
        <div className="my-2 border-t" />

        {/* Canvas */}
        <Link
          href="/canvas"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors"
        >
          <PenTool className="h-4 w-4" />
          画布
        </Link>

        {/* Assets */}
        <Link
          href="/assets"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors"
        >
          <FolderOpen className="h-4 w-4" />
          资产
        </Link>

        {/* Spacer */}
        <div className="flex-1" />

        <RecentProjects />
      </div>
    </ScrollArea>
  );
}

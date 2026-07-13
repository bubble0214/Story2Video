'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { PenLine, FileText, Music, Image, Video, Clapperboard, type LucideIcon } from 'lucide-react';

interface AssetCategory {
  mode: string;
  label: string;
  description: string;
  Icon: LucideIcon;
}

const CATEGORIES: AssetCategory[] = [
  { mode: 'novel', label: '小说', description: 'AI 生成的小说和故事', Icon: PenLine },
  { mode: 'script', label: '剧本', description: '剧本和脚本', Icon: FileText },
  { mode: 'lyrics', label: '歌曲', description: '生成的歌曲和音乐', Icon: Music },
  { mode: 'image', label: '图片', description: '生成的图片和艺术', Icon: Image },
  { mode: 'mv', label: 'MV', description: '生成的音乐视频', Icon: Clapperboard },
  { mode: 'video', label: '视频', description: '数字人和动画视频', Icon: Video },
];

const ASSET_MODE_PATHS: Record<string, string> = {
  lyrics: '/assets/song',
};

export default function AssetsPage() {
  return (
    <div className="container max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">资产</h1>
        <p className="text-muted-foreground mt-1">
          按类别浏览生成的内容
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((cat) => {
          const Icon = cat.Icon;
          const assetPath = ASSET_MODE_PATHS[cat.mode] ?? `/assets/${cat.mode}`;
          return (
            <Link key={cat.mode} href={assetPath}>
              <Card className="cursor-pointer hover:border-primary/50 transition-colors">
                <CardContent className="flex flex-col items-center text-center pt-8 pb-6">
                  <Icon className="h-10 w-10 mb-3 text-muted-foreground" />
                  <h3 className="font-semibold text-base">{cat.label}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {cat.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

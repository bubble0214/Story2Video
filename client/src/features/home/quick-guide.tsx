'use client';

import { BookOpen, FileText, Music, Video } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const STEPS = [
  { icon: BookOpen, text: '输入关键词 → 我们找到参考小说' },
  { icon: FileText, text: 'AI 生成你的小说或歌词' },
  { icon: Music, text: '从歌词创建歌曲' },
  { icon: Video, text: '生成数字人视频' },
];

export function QuickGuide() {
  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="mb-4 text-lg font-semibold">使用说明</h3>
        <div className="space-y-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={i} className="flex items-center gap-3">
                <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {step.text}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

'use client';

import { BookOpen, FileText, Music, Video } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const STEPS = [
  { icon: BookOpen, text: 'Enter keywords -> we find reference novels' },
  { icon: FileText, text: 'AI generates your novel or lyrics' },
  { icon: Music, text: 'Create a song from your lyrics' },
  { icon: Video, text: 'Generate a digital-human video' },
];

export function QuickGuide() {
  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="mb-4 text-lg font-semibold">How it works</h3>
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

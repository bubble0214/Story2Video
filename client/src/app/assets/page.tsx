'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { PenLine, FileText, Music, Image, Video, type LucideIcon } from 'lucide-react';

interface AssetCategory {
  mode: string;
  label: string;
  description: string;
  Icon: LucideIcon;
}

const CATEGORIES: AssetCategory[] = [
  { mode: 'novel', label: 'Novels', description: 'AI-generated novels and stories', Icon: PenLine },
  { mode: 'script', label: 'Scripts', description: 'Screenplays and scripts', Icon: FileText },
  { mode: 'lyrics', label: 'Lyrics', description: 'Song lyrics and poems', Icon: FileText },
  { mode: 'song', label: 'Songs', description: 'Generated music and audio', Icon: Music },
  { mode: 'image', label: 'Images', description: 'Generated pictures and art', Icon: Image },
  { mode: 'video', label: 'Videos', description: 'Avatar and animation videos', Icon: Video },
];

export default function AssetsPage() {
  return (
    <div className="container max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Assets</h1>
        <p className="text-muted-foreground mt-1">
          Browse your generated content by category
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((cat) => {
          const Icon = cat.Icon;
          return (
            <Link key={cat.mode} href={`/assets/${cat.mode}`}>
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

'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PenLine, FileText, Music, Image, Video, type LucideIcon } from 'lucide-react';

interface FeaturedWork {
  id: string;
  title: string;
  description: string;
  type: string;
  Icon: LucideIcon;
}

const FEATURED: FeaturedWork[] = [
  {
    id: '1',
    title: 'The Last Horizon',
    description: 'A sci-fi novel about space colonization',
    type: 'Novel',
    Icon: PenLine,
  },
  {
    id: '2',
    title: 'Neon Dreams',
    description: 'Cyberpunk script with AI protagonists',
    type: 'Script',
    Icon: FileText,
  },
  {
    id: '3',
    title: 'Starlight Sonata',
    description: 'An orchestral AI-generated song',
    type: 'Song',
    Icon: Music,
  },
  {
    id: '4',
    title: 'Pixel Kingdoms',
    description: 'Fantasy landscape image set',
    type: 'Image',
    Icon: Image,
  },
  {
    id: '5',
    title: 'Digital Avatar',
    description: 'AI narrator video presentation',
    type: 'Video',
    Icon: Video,
  },
];

export function FeaturedWorks() {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">Featured Works</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory">
        {FEATURED.map((work) => {
          const Icon = work.Icon;
          return (
            <Card
              key={work.id}
              className="shrink-0 w-56 snap-start cursor-default"
            >
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {work.type}
                  </Badge>
                </div>
                <h3 className="font-semibold text-sm mb-1">{work.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {work.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

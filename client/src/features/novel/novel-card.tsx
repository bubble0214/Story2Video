import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { SearchResultItem } from '@/types/novel';

interface NovelCardProps {
  novel: SearchResultItem;
}

export function NovelCard({ novel }: NovelCardProps) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-lg truncate">{novel.title}</h3>
            {novel.author && (
              <p className="text-sm text-muted-foreground mt-0.5">by {novel.author}</p>
            )}
            {novel.tags && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {novel.tags.split(',').map((tag) => (
                  <Badge key={tag.trim()} variant="outline" className="text-xs">
                    {tag.trim()}
                  </Badge>
                ))}
              </div>
            )}
            {novel.summary && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-3">
                {novel.summary}
              </p>
            )}
          </div>
          <Badge variant="secondary" className="shrink-0">
            {(novel.score * 100).toFixed(0)}% match
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

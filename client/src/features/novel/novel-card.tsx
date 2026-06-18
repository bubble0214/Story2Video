import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { SearchResultItem } from '@/types/novel';

interface NovelCardProps {
  novel: SearchResultItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

export function NovelCard({ novel, isSelected, onSelect }: NovelCardProps) {
  return (
    <Card
      className={`cursor-pointer transition-all hover:border-primary ${
        isSelected ? 'border-primary ring-1 ring-primary' : ''
      }`}
      onClick={() => onSelect(novel.id)}
    >
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <h3 className="font-semibold text-lg">{novel.title}</h3>
          <Badge variant="secondary">
            {(novel.score * 100).toFixed(0)}% match
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

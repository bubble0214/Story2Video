'use client';

import { useQuery } from '@tanstack/react-query';
import { novelsApi } from '@/services/novels';
import { NovelCard } from './novel-card';
import { Button } from '@/components/ui/button';
import { useWorkflow } from '@/hooks/use-workflow';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';

interface NovelListProps {
  keywords: string;
  selectedModel?: string;
}

export function NovelList({ keywords, selectedModel }: NovelListProps) {
  const router = useRouter();
  const { setSelectedNovel, store, startWorkflow } = useWorkflow();
  const { isAuthenticated } = useAuth();

  const keywordList = keywords
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['novels', keywords],
    queryFn: () => novelsApi.search({ keywords: keywordList }),
    enabled: keywordList.length > 0,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 rounded-lg border bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    const axiosError = error as { response?: { data?: { detail?: string } }; message?: string };
    const errorMsg = axiosError.response?.data?.detail || axiosError.message || 'An error occurred';
    return (
      <div className="text-center py-8">
        <p className="text-destructive mb-2">Failed to load novels</p>
        <p className="text-sm text-muted-foreground mb-4">{errorMsg}</p>
        <Button variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data?.data || data.data.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">
          No novels found for these keywords. Try different keywords.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        {data.data.map((novel) => (
          <NovelCard
            key={novel.id}
            novel={novel}
            isSelected={store.selectedNovelId === novel.id}
            onSelect={(id) => setSelectedNovel(id)}
          />
        ))}
      </div>
      <Button
        className="w-full"
        size="lg"
        disabled={!store.selectedNovelId}
        onClick={() => startWorkflow(selectedModel)}
      >
        Start Generation
      </Button>
    </div>
  );
}

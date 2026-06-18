'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { novelsApi } from '@/services/novels';
import { tasksApi } from '@/services/tasks';
import { NovelCard } from './novel-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ModelSelector } from '@/components/model-selector';
import { PromptOptimizer } from '@/components/prompt-optimizer';
import { toast } from '@/hooks/use-toast';
import type { SearchResultItem } from '@/types/novel';

interface NovelListProps {
  keywords: string;
  selectedModel?: string;
}

export function NovelList({ keywords, selectedModel }: NovelListProps) {
  const router = useRouter();
  const [customPrompt, setCustomPrompt] = useState('');
  const [genModel, setGenModel] = useState(selectedModel || '');
  const [chapterCount, setChapterCount] = useState(5);

  const keywordList = keywords
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['novels', keywords],
    queryFn: () => novelsApi.search({ keywords: keywordList }),
    enabled: keywordList.length > 0,
  });

  const novels: SearchResultItem[] = data?.data ?? [];

  const baseMutation = useMutation({
    mutationFn: (longNovel: boolean) =>
      tasksApi.create({
        workflow_type: longNovel ? 'generate_long_novel' : 'generate_novel',
        input_params: {
          reference_ids: novels.map((n) => n.id),
          custom_prompt: customPrompt.trim(),
          ...(longNovel ? { num_chapters: chapterCount } : {}),
          ...(genModel ? { model: genModel } : {}),
        },
      }),
    onSuccess: ({ data }) => {
      router.push(`/task/${data.id}`);
    },
    onError: (err) => {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      toast({ title: 'Failed to start generation', description: e.response?.data?.detail || e.message, variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-lg border bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    const axiosError = error as { response?: { data?: { detail?: string } }; message?: string };
    return (
      <div className="text-center py-8">
        <p className="text-destructive mb-2">Failed to load novels</p>
        <p className="text-sm text-muted-foreground mb-4">{axiosError.response?.data?.detail || axiosError.message || 'An error occurred'}</p>
        <Button variant="outline" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  if (novels.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No novels found for these keywords. Try different keywords.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Reference novels */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Reference Novels ({novels.length})
        </h2>
        <p className="text-sm text-muted-foreground">
          These novels will be used as reference material for generation.
        </p>
        <div className="grid gap-3">
          {novels.map((novel) => (
            <NovelCard key={novel.id} novel={novel} />
          ))}
        </div>
      </div>

      {/* Original Novel Generation */}
      <Card className="border-primary/30">
        <CardContent className="pt-6 space-y-4">
          <div>
            <h3 className="font-semibold text-base">Generate Original Novel</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Write your creative instructions for the AI. The reference novels above
              will be used as inspiration to create a completely original novel.
            </p>
          </div>

          <textarea
            className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
            placeholder="Describe the novel you want to create — genre, characters, plot direction, writing style, or any specific elements to include..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            rows={4}
          />

          <PromptOptimizer value={customPrompt} onAccept={(v) => setCustomPrompt(v)} />

          <div className="flex flex-wrap items-center gap-3">
            <div className="w-48">
              <ModelSelector value={genModel} onChange={setGenModel} />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground whitespace-nowrap">Chapters:</label>
              <Input
                type="number"
                min={1}
                max={50}
                className="w-20 h-9 text-sm"
                value={chapterCount}
                onChange={(e) => setChapterCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => baseMutation.mutate(false)}
              disabled={!customPrompt.trim() || baseMutation.isPending}
              size="lg"
            >
              {baseMutation.isPending ? 'Generating...' : 'Generate Short Novel'}
            </Button>
            <Button
              onClick={() => baseMutation.mutate(true)}
              disabled={!customPrompt.trim() || baseMutation.isPending}
              size="lg"
              variant="secondary"
            >
              {baseMutation.isPending ? 'Generating...' : `Generate Long Novel (${chapterCount} chapters)`}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <strong>Short Novel:</strong> single LLM call, ~2000 words. &nbsp;
            <strong>Long Novel:</strong> generates chapter by chapter, each chapter is a separate LLM call.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

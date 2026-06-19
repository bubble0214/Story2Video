'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { promptsApi } from '@/services/prompts';
import { Button } from '@/components/ui/button';
import { Sparkles, Check, X, Loader2 } from 'lucide-react';

import type { SearchResultItem } from '@/types/novel';

interface PromptOptimizerProps {
  value: string;
  onAccept: (optimized: string) => void;
  references?: SearchResultItem[];
}

export function PromptOptimizer({ value, onAccept, references }: PromptOptimizerProps) {
  const [optimized, setOptimized] = useState<string | null>(null);
  const [showOptimizer, setShowOptimizer] = useState(false);

  const optimizeMutation = useMutation({
    mutationFn: () => {
      let promptText = value;
      if (references && references.length > 0) {
        const refsText = references
          .map((r, i) => `推荐小说${i + 1}：《${r.title}》（作者：${r.author}）\n摘要：${r.summary}`)
          .join('\n\n');
        promptText = `参考以下推荐小说：\n\n${refsText}\n\n---\n\n用户创作提示词：\n${value}`;
      }
      return promptsApi.optimize({ prompt: promptText });
    },
    onSuccess: ({ data }) => setOptimized(data.optimized),
  });

  const handleAccept = () => {
    if (optimized) {
      onAccept(optimized);
      setOptimized(null);
      setShowOptimizer(false);
    }
  };

  const handleReject = () => {
    setOptimized(null);
    setShowOptimizer(false);
  };

  if (!showOptimizer) {
    return (
      <div className="pt-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (value.trim()) {
              setShowOptimizer(true);
              optimizeMutation.mutate();
            }
          }}
          disabled={!value.trim() || optimizeMutation.isPending}
          className="text-xs text-muted-foreground h-7 px-2"
        >
          {optimizeMutation.isPending ? (
            <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> 优化中...</>
          ) : (
            <><Sparkles className="h-3 w-3 mr-1" /> 优化提示词</>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="pt-1">
      {optimized === null ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          优化中...
        </div>
      ) : (
        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">优化后的提示词</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6 text-green-600" onClick={handleAccept} title="使用">
                <Check className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={handleReject} title="拒绝">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-sm whitespace-pre-wrap">{optimized}</p>
        </div>
      )}
    </div>
  );
}

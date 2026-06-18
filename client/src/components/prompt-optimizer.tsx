'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { promptsApi } from '@/services/prompts';
import { Button } from '@/components/ui/button';
import { Sparkles, Check, X, Loader2 } from 'lucide-react';

interface PromptOptimizerProps {
  value: string;
  onAccept: (optimized: string) => void;
}

export function PromptOptimizer({ value, onAccept }: PromptOptimizerProps) {
  const [optimized, setOptimized] = useState<string | null>(null);

  const optimizeMutation = useMutation({
    mutationFn: () => promptsApi.optimize({ prompt: value }),
    onSuccess: ({ data }) => setOptimized(data.optimized),
  });

  const handleAccept = () => {
    if (optimized) {
      onAccept(optimized);
      setOptimized(null);
    }
  };

  const handleReject = () => setOptimized(null);

  // Don't show if prompt is empty or we're loading the result
  if (!value.trim()) return null;

  return (
    <div className="space-y-2">
      {optimized === null ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => optimizeMutation.mutate()}
          disabled={optimizeMutation.isPending}
          className="text-xs text-muted-foreground h-7 px-2"
        >
          {optimizeMutation.isPending ? (
            <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Optimizing...</>
          ) : (
            <><Sparkles className="h-3 w-3 mr-1" /> Optimize with AI</>
          )}
        </Button>
      ) : (
        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Optimized Prompt</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6 text-green-600" onClick={handleAccept} title="Accept">
                <Check className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={handleReject} title="Reject">
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

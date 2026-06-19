'use client';

import { useState } from 'react';
import { useWorkflowStore } from '@/stores/workflow-store';
import { NovelList } from '@/features/novel/novel-list';
import { Button } from '@/components/ui/button';
import { ModelSelector } from '@/components/model-selector';
import { CurrentTaskBanner } from '@/components/current-task-banner';

export default function NovelPage() {
  const keywords = useWorkflowStore((s) => s.keywords);
  const setKeywords = useWorkflowStore((s) => s.setKeywords);
  const [submitted, setSubmitted] = useState(() => !!keywords.trim());
  const [selectedModel, setSelectedModel] = useState('');

  const handleSearch = () => {
    if (!keywords.trim()) return;
    setSubmitted(true);
  };

  return (
    <div className="py-8 px-4 max-w-2xl mx-auto space-y-10">
      {/* Current task banner */}
      <CurrentTaskBanner />

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Novel Recommendations
        </h1>
        <p className="text-muted-foreground mt-1">
          Enter keywords to find novels that match your interests
        </p>
      </div>

      {/* Keyword Input */}
      <div className="space-y-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">Keywords</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-28 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="e.g. sci-fi, time travel, artificial intelligence"
                value={keywords}
                onChange={(e) => {
                  setKeywords(e.target.value);
                  if (submitted) setSubmitted(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch();
                }}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <ModelSelector value={selectedModel} onChange={setSelectedModel} />
              </div>
            </div>
            <Button onClick={handleSearch} disabled={!keywords.trim()}>
              Search
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Separate keywords with commas
          </p>
        </div>
      </div>

      {/* Novel Results */}
      {submitted && keywords.trim() && (
        <NovelList keywords={keywords} selectedModel={selectedModel} />
      )}
    </div>
  );
}

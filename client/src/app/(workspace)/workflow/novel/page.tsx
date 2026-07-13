'use client';

import { Suspense, useState, useRef, useEffect } from 'react';
import { useWorkflowStore } from '@/stores/workflow-store';
import { draftsApi } from '@/services/drafts';
import type { NovelDraftStepData } from '@/types/draft';
import { NovelList } from '@/features/novel/novel-list';
import { Button } from '@/components/ui/button';
import { ModelSelector } from '@/components/model-selector';
import { useSearchParams, useRouter } from 'next/navigation';

function NovelPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const draftParam = searchParams.get('draft');

  const keywords = useWorkflowStore((s) => s.keywords);
  const setKeywords = useWorkflowStore((s) => s.setKeywords);
  const reset = useWorkflowStore((s) => s.reset);
  const [submitted, setSubmitted] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(!!draftParam);
  const [restoredKeywords, setRestoredKeywords] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const loadedRef = useRef(false);

  // Reset workflow store on mount for a clean slate
  useEffect(() => {
    reset();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load draft by ID from URL param (one-time on mount)
  useEffect(() => {
    if (!draftParam || loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      try {
        const { data: full } = await draftsApi.get(draftParam);
        const sd = full.step_data as NovelDraftStepData;
        const kw = sd.keywords || '';
        if (kw) {
          setKeywords(kw);
          setRestoredKeywords(kw);
        }
        setSubmitted(true);
      } catch {
        // ignore
      }
      setLoadingDraft(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hasData = draftParam || keywords.trim();
  const showList = hasData && (submitted || (draftParam && !loadingDraft));

  const handleSearch = () => {
    if (!keywords.trim()) return;
    setSubmitted(true);
  };

  return (
    <div className="py-8 px-4 max-w-2xl mx-auto space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          小说推荐
        </h1>
        <p className="text-muted-foreground mt-1">
          输入关键词查找与你兴趣相符的小说
        </p>
      </div>

      {/* Keyword Input — always visible when not loading a draft */}
      {!loadingDraft && (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">关键词</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-28 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder="例如：科幻、时间旅行、人工智能"
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
                  <ModelSelector value={llmModel} onChange={setLlmModel} />
                </div>
              </div>
              <Button onClick={handleSearch} disabled={!keywords.trim()}>
                搜索
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              用逗号分隔关键词
            </p>
          </div>
        </div>
      )}

      {/* Novel Results */}
      {showList && (
        <NovelList
          keywords={keywords}
          selectedModel={llmModel}
          initialDraftId={draftParam ?? undefined}
        />
      )}
    </div>
  );
}

export default function NovelPage() {
  return (
    <Suspense fallback={<div className="py-8 px-4 max-w-2xl mx-auto"><p className="text-muted-foreground">加载中...</p></div>}>
      <NovelPageInner />
    </Suspense>
  );
}

'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LyricsPage } from '@/features/lyrics/lyrics-page';

function LyricsPageInner() {
  const searchParams = useSearchParams();
  const draft = searchParams.get('draft');

  return <LyricsPage initialDraftId={draft} />;
}

export default function LyricsRoutePage() {
  return (
    <Suspense fallback={<div className="py-8 px-4 max-w-2xl mx-auto"><p className="text-muted-foreground">加载中...</p></div>}>
      <LyricsPageInner />
    </Suspense>
  );
}

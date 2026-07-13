'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { MvPage } from '@/features/mv/mv-page';

function MvPageInner() {
  const searchParams = useSearchParams();
  const draft = searchParams.get('draft');

  return (
    <MvPage initialDraftId={draft ?? undefined} />
  );
}

export default function MvRoutePage() {
  return (
    <Suspense fallback={<div className="py-8 px-4 max-w-2xl mx-auto"><p className="text-muted-foreground">加载中...</p></div>}>
      <MvPageInner />
    </Suspense>
  );
}

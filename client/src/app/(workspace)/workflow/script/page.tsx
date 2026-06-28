'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScriptPage } from '@/features/script/script-page';

function ScriptRouteInner() {
  const searchParams = useSearchParams();
  const draftParam = searchParams.get('draft') ?? undefined;
  return <ScriptPage initialDraftId={draftParam} />;
}

export default function ScriptRoutePage() {
  return (
    <Suspense fallback={<div className="py-8 px-4 max-w-2xl mx-auto"><p className="text-muted-foreground">加载中...</p></div>}>
      <ScriptRouteInner />
    </Suspense>
  );
}

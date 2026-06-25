'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { draftsApi } from '@/services/drafts';
import type { NovelDraftStepData } from '@/types/draft';

export interface UseDraftPersistenceOptions {
  initialDraftId?: string;
  collectStepData: () => Record<string, any>;
}

export function useDraftPersistence({ initialDraftId, collectStepData }: UseDraftPersistenceOptions) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('未命名');
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const draftCreatedRef = useRef(false);

  const ensureDraft = useCallback(async () => {
    if (draftCreatedRef.current && draftId) return draftId;
    try {
      const { data: newDraft } = await draftsApi.create({ workflow_type: 'novel' });
      setDraftId(newDraft.id);
      setDraftTitle(newDraft.title || '未命名');
      draftCreatedRef.current = true;
      return newDraft.id;
    } catch {
      return null;
    }
  }, [draftId]);

  const saveDraft = useCallback(async (
    step: string,
    overrides: Record<string, any> = {},
    completed = false,
  ) => {
    const id = await ensureDraft();
    if (!id) return;
    try {
      const data = collectStepData();
      await draftsApi.update(id, {
        current_step: step,
        status: completed ? 'completed' : 'in_progress',
        step_data: { ...data, ...overrides } as any,
      });
    } catch {
      // Silent fail
    }
  }, [ensureDraft, collectStepData]);

  // ── Mount-time draft restoration ──
  // Accepts a restore callback from the parent to set interactive state
  const [onRestore, setOnRestore] = useState<((sd: any) => void) | null>(null);
  // This ref allows passing restore without re-triggering the effect
  const restoreRef = useRef<((sd: any) => void) | null>(null);
  useEffect(() => { restoreRef.current = onRestore; }, [onRestore]);

  useEffect(() => {
    if (draftLoaded) return;
    if (!initialDraftId) { setDraftLoaded(true); return; }
    (async () => {
      try {
        const { data: full } = await draftsApi.get(initialDraftId);
        const sd = full.step_data as NovelDraftStepData;
        setDraftId(full.id);
        draftCreatedRef.current = true;
        setDraftTitle(full.title || '未命名');
        // Return step_data for parent to apply (generic approach)
        if (restoreRef.current) {
          restoreRef.current(sd);
        }
        return sd;
      } catch {
        // ignore
      } finally {
        setDraftLoaded(true);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    draftId, setDraftId,
    draftTitle, setDraftTitle,
    editingTitle, setEditingTitle,
    draftLoaded,
    ensureDraft,
    saveDraft,
    draftCreatedRef,
    // Callback for parent to register a restore function
    setOnRestore,
  };
}

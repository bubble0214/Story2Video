'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { draftsApi } from '@/services/drafts';
import { toast } from '@/hooks/use-toast';
import type { NovelDraftStepData } from '@/types/draft';

export interface UseDraftPersistenceOptions {
  initialDraftId?: string;
  collectStepData: () => Record<string, any>;
  workflowType?: string;
}

// sessionStorage key for remembering active draft across navigations
function activeDraftKey(workflowType: string) {
  return `active_draft_${workflowType}`;
}

export function useDraftPersistence({ initialDraftId, collectStepData: _initialCollect, workflowType = 'novel' }: UseDraftPersistenceOptions) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('未命名');
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const draftCreatedRef = useRef(false);
  const collectStepDataRef = useRef(_initialCollect);
  // Allow external update of collectStepData
  const setCollectStepData = useCallback((fn: () => Record<string, any>) => {
    collectStepDataRef.current = fn;
  }, []);

  // ── Ensure draft exists ──
  const ensureDraft = useCallback(async (currentStep: string = 'prompt') => {
    if (draftCreatedRef.current && draftId) return draftId;
    try {
      const data = collectStepDataRef.current();
      if (initialDraftId) {
        // Editing existing draft — load it
        const { data: existing } = await draftsApi.get(initialDraftId);
        setDraftId(existing.id);
        setDraftTitle(existing.title || '未命名');
        draftCreatedRef.current = true;
        // Remember this draft in session storage
        try { sessionStorage.setItem(activeDraftKey(workflowType), existing.id); } catch {}
        return existing.id;
      } else {
        // Check session storage for an active draft for this workflow type
        const rememberedId = (() => { try { return sessionStorage.getItem(activeDraftKey(workflowType)); } catch { return null; } })();
        if (rememberedId) {
          try {
            const { data: existing } = await draftsApi.get(rememberedId);
            if (existing.status === 'in_progress') {
              setDraftId(existing.id);
              setDraftTitle(existing.title || '未命名');
              draftCreatedRef.current = true;
              return existing.id;
            }
          } catch {
            // Stale reference, ignore
          }
        }
        // New draft — create a fresh one with a unique group id
        const draftGroupId = crypto.randomUUID();
        const { data: draft } = await draftsApi.create({
          workflow_type: workflowType,
          draft_group_id: draftGroupId,
        });
        setDraftId(draft.id);
        setDraftTitle(draft.title || '未命名');
        draftCreatedRef.current = true;
        // Remember this draft in session storage
        try { sessionStorage.setItem(activeDraftKey(workflowType), draft.id); } catch {}
        return draft.id;
      }
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      console.error('[DraftPersistence] ensureDraft failed:', e.response?.data?.detail || e.message);
      return null;
    }
  // We use initialDraftId as a stable identifier — only re-create callback if it changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraftId]);

  const saveDraft = useCallback(async (
    step: string,
    overrides: Record<string, any> = {},
    completed = false,
  ) => {
    const id = await ensureDraft(step);
    if (!id) return;
    try {
      const data = collectStepDataRef.current();
      await draftsApi.update(id, {
        current_step: step,
        status: completed ? 'completed' : 'in_progress',
        step_data: { ...data, ...overrides } as any,
      });
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      console.error('[DraftPersistence] save failed:', e.response?.data?.detail || e.message);
    }
  }, [ensureDraft]);

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
    setCollectStepData,
    // Callback for parent to register a restore function
    setOnRestore,
  };
}

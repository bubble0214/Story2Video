import { apiClient } from './axios';
import type {
  CreateDraftReq,
  Draft,
  DraftListItem,
  FinalNovelDecisionReq,
  FinalNovelDecisionResp,
  GenerateChapterReq,
  GenerateChapterResp,
  SubmitVolumeDecisionResp,
  VolumeReviewDecisionReq,
  UpsertDraftReq,
  UpdateDraftReq,
} from '@/types/draft';

export const draftsApi = {
  create: (body: CreateDraftReq) =>
    apiClient.post<Draft>('/v1/drafts/create', body),

  upsert: (body: UpsertDraftReq) =>
    apiClient.post<Draft>('/v1/drafts/upsert', body),

  list: (params?: { limit?: number; offset?: number; workflow_type?: string }) =>
    apiClient.get<DraftListItem[]>('/v1/drafts/list', { params }),

  get: (id: string) =>
    apiClient.get<Draft>(`/v1/drafts/${id}`),

  update: (id: string, body: UpdateDraftReq) =>
    apiClient.put<Draft>(`/v1/drafts/${id}`, body),

  delete: (id: string) =>
    apiClient.delete(`/v1/drafts/${id}`),

  generateChapter: (draftId: string, body?: GenerateChapterReq) =>
    apiClient.post<GenerateChapterResp>(`/v1/drafts/${draftId}/generate-chapter`, body ?? {}),

  submitVolumeDecision: (draftId: string, body: VolumeReviewDecisionReq) =>
    apiClient.post<GenerateChapterResp | SubmitVolumeDecisionResp>(`/v1/drafts/${draftId}/volume-decision`, body),

  submitFinalDecision: (draftId: string, body: FinalNovelDecisionReq) =>
    apiClient.post<FinalNovelDecisionResp>(`/v1/drafts/${draftId}/final-decision`, body),
};

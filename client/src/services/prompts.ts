import { apiClient } from './axios';
import type { SearchResultItem } from '@/types/novel';
import type { AnalyzeChaptersResp } from '@/types/draft';

export const promptsApi = {
  optimize: (data: { prompt: string }) =>
    apiClient.post<{ optimized: string }>('/v1/prompts/optimize', data),
  analyzeNovels: (data: { novels: Partial<SearchResultItem>[] }) =>
    apiClient.post<{ analysis: string }>('/v1/prompts/analyze-novels', data),
  analyzeChapters: (data: { chapters: { title: string; content: string }[]; chapter_count: number }) =>
    apiClient.post<AnalyzeChaptersResp>('/v1/prompts/analyze-chapters', data),
};

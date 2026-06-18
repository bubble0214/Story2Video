import { apiClient } from './axios';
import type { SearchNovelReq, SearchResultItem } from '@/types/novel';

export const novelsApi = {
  search: (data: SearchNovelReq) =>
    apiClient.post<SearchResultItem[]>('/v1/novels/search', data),
};
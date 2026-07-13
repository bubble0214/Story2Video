import { apiClient } from './axios';
import type {
  CreateApiKeyReq,
  ApiKeyResp,
  TestApiKeyReq,
  TestApiKeyResp,
  CozeDiscoverReq,
  CozeDiscoverResp,
  CozeCreateBotReq,
  CozeCreateBotResp,
} from '@/types/api-key';

export const apiKeysApi = {
  list: () => apiClient.get<ApiKeyResp[]>('/v1/api-keys'),

  create: (data: CreateApiKeyReq) =>
    apiClient.post<ApiKeyResp>('/v1/api-keys', data),

  update: (id: string, key: string) =>
    apiClient.put<ApiKeyResp>(`/v1/api-keys/${id}`, { key }),

  delete: (id: string) =>
    apiClient.delete(`/v1/api-keys/${id}`),

  test: (data: TestApiKeyReq) =>
    apiClient.post<TestApiKeyResp>('/v1/api-keys/test', data),

  discoverCoze: (data: CozeDiscoverReq) =>
    apiClient.post<CozeDiscoverResp>('/v1/api-keys/coze/discover', data),

  createCozeBot: (data: CozeCreateBotReq) =>
    apiClient.post<CozeCreateBotResp>('/v1/api-keys/coze/create-bot', data),
};

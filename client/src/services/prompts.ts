import { apiClient } from './axios';

export const promptsApi = {
  optimize: (data: { prompt: string }) =>
    apiClient.post<{ optimized: string }>('/v1/prompts/optimize', data),
};

import { apiClient } from './axios';

export interface UserPreferences {
  embedding_provider: string | null;
}

export const preferencesApi = {
  get: () => apiClient.get<UserPreferences>('/v1/preferences'),

  update: (data: { embedding_provider: string }) =>
    apiClient.put<UserPreferences>('/v1/preferences', data),
};

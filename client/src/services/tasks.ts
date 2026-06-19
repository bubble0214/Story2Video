import { apiClient } from './axios';
import type {
  CreateTaskReq,
  TaskResp,
  TaskListResp,
  MusicGenerateReq,
  MusicGenerateResp,
  AvatarVideoReq,
  AvatarVideoResp,
} from '@/types/task';

export const tasksApi = {
  create: (data: CreateTaskReq) =>
    apiClient.post<TaskResp>('/v1/tasks/create', data),

  get: (taskId: string) => apiClient.get<TaskResp>(`/v1/tasks/${taskId}`),

  list: (params?: { limit?: number; offset?: number; workflow_type?: string }) =>
    apiClient.get<TaskListResp>('/v1/tasks/list', { params }),

  delete: (id: string) =>
    apiClient.delete<{ message: string }>(`/v1/tasks/${id}`),

  patch: (taskId: string, data: { result: Record<string, unknown> }) =>
    apiClient.patch<TaskResp>(`/v1/tasks/${taskId}`, data),
};

export const musicApi = {
  generate: (data: MusicGenerateReq) =>
    apiClient.post<MusicGenerateResp>('/v1/music/generate', data),
};

export const avatarApi = {
  generateVideo: (data: AvatarVideoReq) =>
    apiClient.post<AvatarVideoResp>('/v1/avatar/generate-video', data),
};
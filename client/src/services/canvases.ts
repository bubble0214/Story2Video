import { apiClient } from './axios';
import type {
  CanvasListItem,
  CanvasMetadata,
  CreateCanvasReq,
  UpdateCanvasReq,
} from '@/types/canvas';

export const canvasesApi = {
  create: (data: CreateCanvasReq) =>
    apiClient.post<CanvasMetadata>('/v1/canvases/create', data),

  list: () => apiClient.get<CanvasListItem[]>('/v1/canvases/list'),

  get: (id: string) =>
    apiClient.get<CanvasMetadata>(`/v1/canvases/${id}`),

  update: (id: string, data: UpdateCanvasReq) =>
    apiClient.put<CanvasMetadata>(`/v1/canvases/${id}`, data),

  delete: (id: string) =>
    apiClient.delete(`/v1/canvases/${id}`),
};

import { apiClient } from './axios';
import type {
  LoginReq,
  RegisterReq,
  TokenPairResp,
  RefreshReq,
  UserResp,
} from '@/types/auth';

export const authApi = {
  login: (data: LoginReq) =>
    apiClient.post<TokenPairResp>('/v1/auth/login', data),

  register: (data: RegisterReq) =>
    apiClient.post<TokenPairResp>('/v1/auth/register', data),

  refresh: (data: RefreshReq) =>
    apiClient.post<TokenPairResp>('/v1/auth/refresh', data),

  getMe: () => apiClient.get<UserResp>('/v1/users/me'),
};
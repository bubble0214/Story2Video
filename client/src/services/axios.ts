import axios from 'axios';
import { useAuthStore } from '@/stores/auth-store';

const API_BASE_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_CLIENT_API_BASE_URL || 'http://103.233.253.246:8005/api')
    : (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://app:8000/api');

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    // Skip 401 handling for login and register endpoints
    const url = error.config?.url || '';
    if (url.includes('/auth/login') || url.includes('/auth/register')) {
      return Promise.reject(error);
    }
    if (error.response?.status === 401) {
      // Try refresh
      const refreshToken = useAuthStore.getState().refreshToken;
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_BASE_URL}/v1/auth/refresh`, {
            refresh_token: refreshToken,
          });
          useAuthStore.getState().setTokens(
            data.access_token,
            data.refresh_token
          );
          // Retry original request with new token
          error.config.headers.Authorization = `Bearer ${data.access_token}`;
          return apiClient(error.config);
        } catch {
          useAuthStore.getState().logout();
        }
      } else {
        useAuthStore.getState().logout();
      }
    }
    return Promise.reject(error);
  }
);
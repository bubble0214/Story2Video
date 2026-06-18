import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserResp } from '@/types/auth';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: UserResp | null;
  isAuthenticated: boolean;
  setTokens: (token: string, refreshToken: string) => void;
  setUser: (user: UserResp) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      setTokens: (token: string, refreshToken: string) =>
        set({ token, refreshToken, isAuthenticated: true }),

      setUser: (user: UserResp) => set({ user }),

      logout: () =>
        set({
          token: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { authApi } from '@/services/auth';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from '@/hooks/use-toast';

export function useAuth() {
  const router = useRouter();
  const { setTokens, setUser, logout: storeLogout, user, isAuthenticated } =
    useAuthStore();

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: ({ data }) => {
      setTokens(data.access_token, data.refresh_token);
      toast({ title: 'Login successful' });
      router.push('/');
    },
    onError: (error) => {
      const err = error as { response?: { data?: unknown }; message?: string };
      const detail = err.response?.data
        ? typeof err.response.data === 'string'
          ? err.response.data
          : (err.response.data as Record<string, unknown>)['detail']
            ?? (err.response.data as Record<string, unknown>)['message']
            ?? (err.response.data as Record<string, unknown>)['error']
        : err.message;
      toast({
        title: 'Login failed',
        description: typeof detail === 'string' ? detail : 'Invalid email or password',
        variant: 'destructive',
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: ({ data }) => {
      setTokens(data.access_token, data.refresh_token);
      toast({ title: 'Registration successful' });
      router.push('/');
    },
    onError: (error) => {
      const err = error as { response?: { data?: unknown }; message?: string };
      const detail = err.response?.data
        ? typeof err.response.data === 'string'
          ? err.response.data
          : (err.response.data as Record<string, unknown>)['detail']
            ?? (err.response.data as Record<string, unknown>)['message']
            ?? (err.response.data as Record<string, unknown>)['error']
        : err.message;
      toast({
        title: 'Registration failed',
        description: typeof detail === 'string' ? detail : 'Email may already be registered',
        variant: 'destructive',
      });
    },
  });

  const {
    isLoading: isCheckingAuth,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const { data } = await authApi.getMe();
      setUser(data);
      return data;
    },
    enabled: isAuthenticated && !user,
    retry: 1,
    staleTime: 60000,
  });

  const logout = () => {
    storeLogout();
    router.push('/');
    toast({ title: 'Logged out' });
  };

  return {
    user,
    isAuthenticated,
    isCheckingAuth,
    login: loginMutation.mutate,
    register: registerMutation.mutate,
    logout,
    isLoginLoading: loginMutation.isPending,
    isRegisterLoading: registerMutation.isPending,
    loginError: loginMutation.error,
    registerError: registerMutation.error,
    refetchUser: refetch,
  };
}

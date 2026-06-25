'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiKeysApi } from '@/services/api-keys';
import { preferencesApi } from '@/services/preferences';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Zap } from 'lucide-react';

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'claude', label: 'Claude (Anthropic)' },
  { value: 'gemini', label: 'Gemini (Google)' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'qwen', label: '通义千问 (阿里)' },
  { value: 'suno', label: 'Suno (音乐)' },
  { value: 'udio', label: 'Udio (音乐)' },
  { value: 'minimax', label: 'MiniMax (音乐)' },
  { value: 'heygen', label: 'HeyGen (数字人)' },
  { value: 'd-id', label: 'D-ID (数字人)' },
  { value: 'custom', label: '自定义 (兼容 OpenAI)' },
  { value: 'glm', label: 'GLM (智谱)' },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newProvider, setNewProvider] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('');
  const [newModelName, setNewModelName] = useState('');

  const {
    data: keysResponse,
    isLoading: keysLoading,
    isError: keysError,
  } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiKeysApi.list(),
  });

  const { data: prefsResponse } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => preferencesApi.get(),
  });

  const keys = keysResponse?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (data: { provider: string; key: string; base_url?: string; model_name?: string }) =>
      apiKeysApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setNewProvider('');
      setNewKey('');
      setNewBaseUrl('');
      setNewModelName('');
      toast({ title: 'API 密钥已保存' });
    },
    onError: (error) => {
      const err = error as { response?: { data?: { detail?: string | unknown[] } }; message?: string };
      let msg = err.message || '未知错误';
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        msg = (detail as { msg?: string }[]).map((d) => d.msg).filter(Boolean).join('; ');
      } else if (typeof detail === 'string') {
        msg = detail;
      }
      toast({ title: '保存密钥失败', description: msg, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiKeysApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast({ title: 'API 密钥已删除' });
    },
    onError: (error) => {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      toast({ title: '删除密钥失败', description: err.response?.data?.detail || err.message, variant: 'destructive' });
    },
  });

  const testMutation = useMutation({
    mutationFn: (data: { provider: string; key?: string; base_url?: string; model_name?: string }) =>
      apiKeysApi.test(data),
    onSuccess: (resp) => {
      const data = resp.data;
      toast({
        title: data.success ? '连接成功' : '连接失败',
        description: data.message,
        variant: data.success ? 'default' : 'destructive',
      });
    },
    onError: (error) => {
      const err = error as { response?: { data?: { detail?: string | unknown[] } }; message?: string };
      let msg = err.message || '未知错误';
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        msg = (detail as { msg?: string }[]).map((d) => d.msg).filter(Boolean).join('; ');
      } else if (typeof detail === 'string') {
        msg = detail;
      }
      toast({ title: '测试失败', description: msg, variant: 'destructive' });
    },
  });

  const handleAddKey = () => {
    if (!newProvider || !newKey.trim()) {
      toast({ title: '请选择提供商并输入密钥', variant: 'destructive' });
      return;
    }
    if (newProvider === 'custom' && !newBaseUrl.trim()) {
      toast({ title: '自定义提供商需要输入基础 URL', variant: 'destructive' });
      return;
    }
    createMutation.mutate({
      provider: newProvider,
      key: newKey.trim(),
      base_url: newBaseUrl.trim() || undefined,
      model_name: newModelName.trim() || undefined,
    });
  };

  return (
    <div className="container max-w-2xl mx-auto py-8 px-4 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">设置</h1>
        <p className="text-muted-foreground mt-1">
          管理你的 API 密钥和提供商偏好
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>添加 API 密钥</CardTitle>
          <CardDescription>
            密钥加密后安全存储。你至少需要一个 LLM 提供商（OpenAI、DeepSeek 等）
            来生成小说/剧本/歌词。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="w-full sm:w-48">
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={newProvider}
                onChange={(e) => setNewProvider(e.target.value)}
              >
                <option value="" disabled>
                  选择提供商
                </option>
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <Input
              className="flex-1 font-mono text-sm"
              placeholder="sk-..."
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              type="password"
            />
          </div>
          {(newProvider === 'custom' || newBaseUrl || newModelName) && (
            <>
              <Input
                placeholder="基础 URL（如 https://api.example.com/v1）"
                value={newBaseUrl}
                onChange={(e) => setNewBaseUrl(e.target.value)}
              />
              <Input
                placeholder="模型名称（如 gpt-4o-mini）"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
              />
            </>
          )}
          <div className="flex gap-2">
            <Button onClick={handleAddKey} disabled={createMutation.isPending}>
              {createMutation.isPending ? '保存中...' : '保存'}
            </Button>
            {newProvider && newKey.trim() && (
              <Button
                variant="outline"
                onClick={() =>
                  testMutation.mutate({
                    provider: newProvider,
                    key: newKey.trim(),
                    base_url: newBaseUrl.trim() || undefined,
                    model_name: newModelName.trim() || undefined,
                  })
                }
                disabled={testMutation.isPending}
              >
                {testMutation.isPending ? '测试中...' : (
                  <><Zap className="h-4 w-4" /> 测试连接</>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>已保存的 API 密钥</CardTitle>
          <CardDescription>
            你存储的提供商密钥。保存后不显示原始密钥。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keysLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
              ))}
            </div>
          )}
          {keysError && (
            <p className="text-destructive text-sm">加载 API 密钥失败</p>
          )}
          {!keysLoading && !keysError && keys.length === 0 && (
            <p className="text-muted-foreground text-sm">
              尚未配置 API 密钥。请在上方添加。
            </p>
          )}
          {keys.length > 0 && (
            <div className="space-y-2">
              {keys.map((key) => {
                const provider = PROVIDERS.find((p) => p.value === key.provider);
                return (
                  <div
                    key={key.id}
                    className="flex items-center justify-between rounded-md border px-4 py-3"
                  >
                    <div className="min-w-0 flex-1 mr-4">
                      <p className="font-medium text-sm">
                        {provider?.label ?? key.provider}
                      </p>
                      {key.base_url && (
                        <p className="text-xs text-muted-foreground font-mono truncate max-w-[320px]">
                          {key.base_url}
                        </p>
                      )}
                      {key.model_name && (
                        <p className="text-xs text-muted-foreground font-mono">
                          模型: {key.model_name}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        保存于 {new Date(key.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          testMutation.mutate({
                            provider: key.provider,
                          })
                        }
                        disabled={testMutation.isPending}
                      >
                        <Zap className="h-3.5 w-3.5 mr-1" />
                        测试
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteMutation.mutate(key.id)}
                        disabled={deleteMutation.isPending}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
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
import { Zap, Search } from 'lucide-react';

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'claude', label: 'Claude (Anthropic)' },
  { value: 'gemini', label: 'Gemini (Google)' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'qwen', label: 'Qwen (Alibaba)' },
  { value: 'suno', label: 'Suno (Music)' },
  { value: 'udio', label: 'Udio (Music)' },
  { value: 'minimax', label: 'MiniMax (Music)' },
  { value: 'heygen', label: 'HeyGen (Avatar)' },
  { value: 'd-id', label: 'D-ID (Avatar)' },
  { value: 'custom', label: 'Custom (OpenAI-compatible)' },
  { value: 'glm', label: 'GLM (Zhipu AI)' },
];

const EMBEDDING_PROVIDERS = [
  { value: 'openai', label: 'OpenAI (text-embedding-3-small)', supportsCustom: true },
  { value: 'deepseek', label: 'DeepSeek (deepseek-embedding)', supportsCustom: false },
  { value: 'qwen', label: 'Qwen (text-embedding-v3)', supportsCustom: false },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // --- LLM API Key state ---
  const [newProvider, setNewProvider] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('');
  const [newModelName, setNewModelName] = useState('');

  // --- Embedding state ---
  const [embeddingProvider, setEmbeddingProvider] = useState('');
  const [embeddingKey, setEmbeddingKey] = useState('');
  const [embeddingBaseUrl, setEmbeddingBaseUrl] = useState('');
  const [embeddingModelName, setEmbeddingModelName] = useState('');

  // Fetch existing keys
  const {
    data: keysResponse,
    isLoading: keysLoading,
    isError: keysError,
  } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiKeysApi.list(),
  });

  // Fetch user preferences
  const { data: prefsResponse } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => preferencesApi.get(),
  });

  // Pre-fill embedding provider from saved preference
  useEffect(() => {
    if (prefsResponse?.data?.embedding_provider) {
      setEmbeddingProvider(prefsResponse.data.embedding_provider);
    }
  }, [prefsResponse]);

  const keys = keysResponse?.data ?? [];
  const embeddingProviderSaved = keys.find(
    (k) => k.provider === (embeddingProvider || prefsResponse?.data?.embedding_provider)
  );

  // --- Mutations ---
  const createMutation = useMutation({
    mutationFn: (data: { provider: string; key: string; base_url?: string; model_name?: string }) =>
      apiKeysApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setNewProvider('');
      setNewKey('');
      setNewBaseUrl('');
      setNewModelName('');
      toast({ title: 'API key saved' });
    },
    onError: (error) => {
      const err = error as { response?: { data?: { detail?: string | unknown[] } }; message?: string };
      let msg = err.message || 'Unknown error';
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        msg = detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join('; ');
      } else if (typeof detail === 'string') {
        msg = detail;
      }
      toast({ title: 'Failed to save key', description: msg, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiKeysApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast({ title: 'API key deleted' });
    },
    onError: (error) => {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      toast({ title: 'Failed to delete key', description: err.response?.data?.detail || err.message, variant: 'destructive' });
    },
  });

  const testMutation = useMutation({
    mutationFn: (data: { provider: string; key?: string; base_url?: string; model_name?: string }) =>
      apiKeysApi.test(data),
    onSuccess: (resp) => {
      const data = resp.data;
      toast({
        title: data.success ? 'Connection successful' : 'Connection failed',
        description: data.message,
        variant: data.success ? 'default' : 'destructive',
      });
    },
    onError: (error) => {
      const err = error as { response?: { data?: { detail?: string | unknown[] } }; message?: string };
      let msg = err.message || 'Unknown error';
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        msg = detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join('; ');
      } else if (typeof detail === 'string') {
        msg = detail;
      }
      toast({ title: 'Test failed', description: msg, variant: 'destructive' });
    },
  });

  const embeddingTestMutation = useMutation({
    mutationFn: (data: { provider: string; key?: string; base_url?: string; model_name?: string }) =>
      apiKeysApi.test(data),
    onSuccess: (resp) => {
      const data = resp.data;
      toast({
        title: data.success ? 'Connection successful' : 'Connection failed',
        description: data.message,
        variant: data.success ? 'default' : 'destructive',
      });
    },
    onError: (error) => {
      const err = error as { response?: { data?: { detail?: string | unknown[] } }; message?: string };
      let msg = err.message || 'Unknown error';
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        msg = detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join('; ');
      } else if (typeof detail === 'string') {
        msg = detail;
      }
      toast({ title: 'Test failed', description: msg, variant: 'destructive' });
    },
  });

  const saveEmbeddingMutation = useMutation({
    mutationFn: () =>
      apiKeysApi.create({
        provider: embeddingProvider,
        key: embeddingKey.trim(),
        base_url: embeddingBaseUrl.trim() || undefined,
        model_name: embeddingModelName.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setEmbeddingKey('');
      setEmbeddingBaseUrl('');
      setEmbeddingModelName('');
      toast({ title: 'Embedding API key saved' });
    },
    onError: (error) => {
      const err = error as { response?: { data?: { detail?: string | unknown[] } }; message?: string };
      let msg = err.message || 'Unknown error';
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        msg = detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join('; ');
      } else if (typeof detail === 'string') {
        msg = detail;
      }
      toast({ title: 'Failed to save embedding key', description: msg, variant: 'destructive' });
    },
  });

  const savePreferenceMutation = useMutation({
    mutationFn: (provider: string) =>
      preferencesApi.update({ embedding_provider: provider }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preferences'] });
      toast({ title: 'Embedding provider saved' });
    },
    onError: () => {
      toast({ title: 'Failed to save preference', variant: 'destructive' });
    },
  });

  const handleAddKey = () => {
    if (!newProvider || !newKey.trim()) {
      toast({ title: 'Please select a provider and enter a key', variant: 'destructive' });
      return;
    }
    if (newProvider === 'custom' && !newBaseUrl.trim()) {
      toast({ title: 'Please enter a base URL for custom provider', variant: 'destructive' });
      return;
    }
    createMutation.mutate({
      provider: newProvider,
      key: newKey.trim(),
      base_url: newBaseUrl.trim() || undefined,
      model_name: newModelName.trim() || undefined,
    });
  };

  const handleSaveEmbedding = () => {
    if (!embeddingProvider) {
      toast({ title: 'Please select an embedding provider', variant: 'destructive' });
      return;
    }
    // Save the preference first
    savePreferenceMutation.mutate(embeddingProvider, {
      onSuccess: () => {
        // If there's a key to save, save it too
        if (embeddingKey.trim()) {
          saveEmbeddingMutation.mutate();
        }
      },
    });
  };

  const currentEmbeddingProvider = EMBEDDING_PROVIDERS.find((p) => p.value === embeddingProvider);

  return (
    <div className="container max-w-2xl mx-auto py-8 px-4 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your API keys and provider preferences
        </p>
      </div>

      {/* Embedding Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>Embedding Provider</CardTitle>
              <CardDescription>
                Used for semantic search in Novel Recommendations. Choose which provider
                powers vector embedding generation.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="w-full sm:w-64">
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={embeddingProvider}
                onChange={(e) => {
                  setEmbeddingProvider(e.target.value);
                  setEmbeddingKey('');
                  setEmbeddingBaseUrl('');
                  setEmbeddingModelName('');
                }}
              >
                <option value="" disabled>
                  Select embedding provider
                </option>
                {EMBEDDING_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {embeddingProvider && (
            <>
              {embeddingProviderSaved ? (
                <div className="rounded-md border px-4 py-3 bg-muted/30">
                  <p className="text-sm font-medium text-green-600 dark:text-green-400">
                    Key configured for {EMBEDDING_PROVIDERS.find((p) => p.value === embeddingProvider)?.label}
                  </p>
                  {embeddingProviderSaved.model_name && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Model: {embeddingProviderSaved.model_name}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        embeddingTestMutation.mutate({
                          provider: embeddingProviderSaved.provider,
                        })
                      }
                      disabled={embeddingTestMutation.isPending}
                    >
                      <Zap className="h-3.5 w-3.5 mr-1" />
                      Test
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteMutation.mutate(embeddingProviderSaved.id)}
                    >
                      Delete Key
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No API key saved for this provider yet. Add one below.
                </p>
              )}

              <div className="space-y-3 border rounded-md p-4">
                <p className="text-sm font-medium">Add API Key for {currentEmbeddingProvider?.label}</p>
                <Input
                  className="font-mono text-sm"
                  placeholder={embeddingProvider === 'openai' ? 'sk-...' : 'API key'}
                  value={embeddingKey}
                  onChange={(e) => setEmbeddingKey(e.target.value)}
                  type="password"
                />
                {embeddingProvider === 'openai' && (
                  <>
                    <Input
                      placeholder="Base URL (optional, e.g. https://api.openai.com/v1)"
                      value={embeddingBaseUrl}
                      onChange={(e) => setEmbeddingBaseUrl(e.target.value)}
                    />
                    <Input
                      placeholder="Model name (optional, default: text-embedding-3-small)"
                      value={embeddingModelName}
                      onChange={(e) => setEmbeddingModelName(e.target.value)}
                    />
                  </>
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveEmbedding}
                    disabled={saveEmbeddingMutation.isPending || savePreferenceMutation.isPending}
                  >
                    {saveEmbeddingMutation.isPending || savePreferenceMutation.isPending
                      ? 'Saving...'
                      : embeddingProviderSaved
                      ? 'Update Provider'
                      : 'Save Provider & Key'}
                  </Button>
                  {embeddingKey.trim() && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        embeddingTestMutation.mutate({
                          provider: embeddingProvider,
                          key: embeddingKey.trim(),
                          base_url: embeddingBaseUrl.trim() || undefined,
                          model_name: embeddingModelName.trim() || undefined,
                        })
                      }
                      disabled={embeddingTestMutation.isPending}
                    >
                      {embeddingTestMutation.isPending ? 'Testing...' : (
                        <><Zap className="h-4 w-4" /> Test Connection</>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add new LLM API Key */}
      <Card>
        <CardHeader>
          <CardTitle>Add API Key</CardTitle>
          <CardDescription>
            Keys are encrypted and stored securely. You need at least one LLM
            provider (OpenAI, DeepSeek, etc.) for novel/script/lyrics generation.
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
                  Select provider
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
                placeholder="Base URL (e.g., https://api.example.com/v1)"
                value={newBaseUrl}
                onChange={(e) => setNewBaseUrl(e.target.value)}
              />
              <Input
                placeholder="Model name (e.g., gpt-4o-mini)"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
              />
            </>
          )}
          <div className="flex gap-2">
            <Button onClick={handleAddKey} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving...' : 'Save'}
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
                {testMutation.isPending ? 'Testing...' : (
                  <><Zap className="h-4 w-4" /> Test Connection</>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Existing keys */}
      <Card>
        <CardHeader>
          <CardTitle>Saved API Keys</CardTitle>
          <CardDescription>
            Your stored provider keys. The raw key is never shown after save.
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
            <p className="text-destructive text-sm">Failed to load API keys</p>
          )}
          {!keysLoading && !keysError && keys.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No API keys configured yet. Add one above.
            </p>
          )}
          {keys.length > 0 && (
            <div className="space-y-2">
              {keys.map((key) => {
                const provider = PROVIDERS.find((p) => p.value === key.provider);
                const isEmbeddingKey = key.provider === (prefsResponse?.data?.embedding_provider);
                return (
                  <div
                    key={key.id}
                    className="flex items-center justify-between rounded-md border px-4 py-3"
                  >
                    <div className="min-w-0 flex-1 mr-4">
                      <p className="font-medium text-sm">
                        {provider?.label ?? key.provider}
                        {isEmbeddingKey && (
                          <span className="ml-2 text-xs text-blue-500 font-normal">(Embedding)</span>
                        )}
                      </p>
                      {key.base_url && (
                        <p className="text-xs text-muted-foreground font-mono truncate max-w-[320px]">
                          {key.base_url}
                        </p>
                      )}
                      {key.model_name && (
                        <p className="text-xs text-muted-foreground font-mono">
                          Model: {key.model_name}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Saved {new Date(key.created_at).toLocaleDateString()}
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
                        Test
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteMutation.mutate(key.id)}
                        disabled={deleteMutation.isPending}
                      >
                        Delete
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

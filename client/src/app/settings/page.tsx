'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiKeysApi } from '@/services/api-keys';
import type {
  CreateApiKeyReq,
  CozeWorkspaceInfo,
  CozeBotInfo,
  CozeCreateBotReq,
} from '@/types/api-key';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Zap, Sparkles, Plus } from 'lucide-react';

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'claude', label: 'Claude (Anthropic)' },
  { value: 'gemini', label: 'Gemini (Google)' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'qwen', label: '通义千问 (阿里)' },
  { value: 'glm', label: 'GLM (智谱)' },
  { value: 'coze', label: 'Coze (扣子)' },
  { value: 'suno', label: 'Suno (音乐)' },
  { value: 'udio', label: 'Udio (音乐)' },
  { value: 'minimax', label: 'MiniMax (音乐)' },
  { value: 'heygen', label: 'HeyGen (数字人)' },
  { value: 'd-id', label: 'D-ID (数字人)' },
  { value: 'custom', label: '自定义 (兼容 OpenAI)' },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newProvider, setNewProvider] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [newCozeSpaceId, setNewCozeSpaceId] = useState('');
  const [newCozeBillingProjectId, setNewCozeBillingProjectId] = useState('');

  const [cozeDiscoverOpen, setCozeDiscoverOpen] = useState(false);
  const [cozeWorkspaces, setCozeWorkspaces] = useState<CozeWorkspaceInfo[]>([]);
  const [cozeSelectedSpaceId, setCozeSelectedSpaceId] = useState('');
  const [cozeSelectedBotId, setCozeSelectedBotId] = useState('');
  const [cozeCreatingBot, setCozeCreatingBot] = useState(false);
  const [cozeNewBotName, setCozeNewBotName] = useState('');
  const [cozeNewBotDesc, setCozeNewBotDesc] = useState('');

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
    mutationFn: (data: CreateApiKeyReq) =>
      apiKeysApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setNewProvider('');
      setNewKey('');
      setNewBaseUrl('');
      setNewModelName('');
      setNewCozeSpaceId('');
      setNewCozeBillingProjectId('');
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

  const cozeDiscoverMutation = useMutation({
    mutationFn: (data: { api_key: string; base_url?: string }) =>
      apiKeysApi.discoverCoze(data),
    onSuccess: (resp) => {
      const workspaces = resp.data.workspaces;
      if (workspaces.length === 0) {
        toast({ title: '未找到工作空间', description: '请检查 PAT 是否有效', variant: 'destructive' });
        return;
      }
      setCozeWorkspaces(workspaces);
      const firstWs = workspaces[0];
      setCozeSelectedSpaceId(firstWs.space_id);
      setCozeSelectedBotId(firstWs.bots[0]?.bot_id ?? '');
      setCozeNewBotName('');
      setCozeNewBotDesc('');
      setCozeDiscoverOpen(true);
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
      toast({ title: '自动获取失败', description: msg, variant: 'destructive' });
    },
  });

  const cozeCreateBotMutation = useMutation({
    mutationFn: (data: CozeCreateBotReq) => apiKeysApi.createCozeBot(data),
    onSuccess: (resp) => {
      const bot = resp.data;
      // Refresh workspaces to include the new bot
      cozeDiscoverMutation.mutate({ api_key: newKey.trim(), base_url: newBaseUrl.trim() || undefined });
      toast({
        title: 'Bot 已创建并发布',
        description: `${bot.name} (${bot.bot_id})`,
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
      toast({ title: '创建 Bot 失败', description: msg, variant: 'destructive' });
    },
  });

  const selectedCozeWorkspace = useMemo(
    () => cozeWorkspaces.find((w) => w.space_id === cozeSelectedSpaceId) ?? null,
    [cozeWorkspaces, cozeSelectedSpaceId],
  );

  const handleCozeDiscoverConfirm = () => {
    if (!selectedCozeWorkspace) return;
    const bot = selectedCozeWorkspace.bots.find((b) => b.bot_id === cozeSelectedBotId);
    setNewCozeSpaceId(selectedCozeWorkspace.space_id);
    setNewCozeBillingProjectId(selectedCozeWorkspace.billing_project_id ?? '');
    if (bot) {
      setNewModelName(bot.bot_id);
    }
    setCozeDiscoverOpen(false);
    toast({
      title: '已自动填充',
      description: bot
        ? `工作空间: ${selectedCozeWorkspace.name}，Bot: ${bot.name}`
        : `工作空间: ${selectedCozeWorkspace.name}`,
    });
  };

  const handleCreateCozeBot = () => {
    if (!selectedCozeWorkspace || !cozeNewBotName.trim()) {
      toast({ title: '请输入 Bot 名称', variant: 'destructive' });
      return;
    }
    cozeCreateBotMutation.mutate({
      api_key: newKey.trim(),
      space_id: selectedCozeWorkspace.space_id,
      name: cozeNewBotName.trim(),
      description: cozeNewBotDesc.trim(),
      base_url: newBaseUrl.trim() || undefined,
    });
  };

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
      coze_space_id: newCozeSpaceId.trim() || undefined,
      coze_billing_project_id: newCozeBillingProjectId.trim() || undefined,
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
                onChange={(e) => {
                  setNewProvider(e.target.value);
                  // Auto-set model name for known providers
                  if (e.target.value === 'minimax') {
                    setNewModelName('music-2.6');
                  } else if (e.target.value === 'suno') {
                    setNewModelName('chirp-v3.5');
                  } else if (e.target.value === 'udio') {
                    setNewModelName('udio-30');
                  }
                }}
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
          <Input
            placeholder="基础 URL（可选，如 https://api.example.com/v1）"
            value={newBaseUrl}
            onChange={(e) => setNewBaseUrl(e.target.value)}
          />
          <Input
            placeholder="模型名称（可选，如 gpt-4o-mini）"
            value={newModelName}
            onChange={(e) => setNewModelName(e.target.value)}
          />
          {newProvider === 'coze' && (
            <>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    cozeDiscoverMutation.mutate({
                      api_key: newKey.trim(),
                      base_url: newBaseUrl.trim() || undefined,
                    })
                  }
                  disabled={cozeDiscoverMutation.isPending || !newKey.trim()}
                >
                  {cozeDiscoverMutation.isPending ? (
                    '获取中...'
                  ) : (
                    <><Sparkles className="h-4 w-4" /> 自动获取配置</>
                  )}
                </Button>
                <span className="text-xs text-muted-foreground self-center">
                  输入 PAT 后点击此按钮，自动填充 Space ID / Bot ID / Billing Project ID
                </span>
              </div>
              <Input
                placeholder="Space ID（必需，Coze 工作空间 ID）"
                value={newCozeSpaceId}
                onChange={(e) => setNewCozeSpaceId(e.target.value)}
              />
              <Input
                placeholder="Billing Project ID（必需，Coze 计费项目 ID）"
                value={newCozeBillingProjectId}
                onChange={(e) => setNewCozeBillingProjectId(e.target.value)}
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
                      {key.coze_space_id && (
                        <p className="text-xs text-muted-foreground font-mono">
                          空间 ID: {key.coze_space_id}
                        </p>
                      )}
                      {key.coze_billing_project_id && (
                        <p className="text-xs text-muted-foreground font-mono">
                          计费项目 ID: {key.coze_billing_project_id}
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

      <Dialog open={cozeDiscoverOpen} onOpenChange={setCozeDiscoverOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>选择 Coze 工作空间与 Bot</DialogTitle>
            <DialogDescription>
              从你的 Coze 账号中自动获取的配置。选中后将自动填充表单。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">工作空间</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={cozeSelectedSpaceId}
                onChange={(e) => {
                  setCozeSelectedSpaceId(e.target.value);
                  const ws = cozeWorkspaces.find((w) => w.space_id === e.target.value);
                  setCozeSelectedBotId(ws?.bots[0]?.bot_id ?? '');
                  setCozeNewBotName('');
                  setCozeNewBotDesc('');
                }}
              >
                {cozeWorkspaces.map((w) => (
                  <option key={w.space_id} value={w.space_id}>
                    {w.name} ({w.space_id})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Bot</label>
              {selectedCozeWorkspace && selectedCozeWorkspace.bots.length > 0 ? (
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={cozeSelectedBotId}
                  onChange={(e) => setCozeSelectedBotId(e.target.value)}
                >
                  {selectedCozeWorkspace.bots.map((b: CozeBotInfo) => (
                    <option key={b.bot_id} value={b.bot_id}>
                      {b.name} ({b.bot_id}){b.is_published ? ' ✓' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    该工作空间下没有已发布的 Bot。点击下方按钮直接创建。
                  </p>
                  <Input
                    placeholder="Bot 名称，如 Story2Video Writer"
                    value={cozeNewBotName}
                    onChange={(e) => setCozeNewBotName(e.target.value)}
                  />
                  <Input
                    placeholder="Bot 描述（可选）"
                    value={cozeNewBotDesc}
                    onChange={(e) => setCozeNewBotDesc(e.target.value)}
                  />
                  <Button
                    size="sm"
                    onClick={handleCreateCozeBot}
                    disabled={cozeCreateBotMutation.isPending || !cozeNewBotName.trim()}
                  >
                    {cozeCreateBotMutation.isPending ? (
                      '创建中...'
                    ) : (
                      <><Plus className="h-4 w-4" /> 创建并发布 Bot</>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {selectedCozeWorkspace && (
              <div className="rounded-md bg-muted px-3 py-2 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Space ID</span>
                  <span className="font-mono">{selectedCozeWorkspace.space_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Billing Project ID</span>
                  <span className="font-mono">
                    {selectedCozeWorkspace.billing_project_id || '未获取到（可手动填写）'}
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCozeDiscoverOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleCozeDiscoverConfirm}
              disabled={!selectedCozeWorkspace}
            >
              确认填充
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

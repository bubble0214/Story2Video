'use client';

import { useQuery } from '@tanstack/react-query';
import { apiKeysApi } from '@/services/api-keys';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuthStore } from '@/stores/auth-store';
import { Sparkles } from 'lucide-react';

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  claude: 'Claude (Anthropic)',
  gemini: 'Gemini (Google)',
  deepseek: 'DeepSeek',
  qwen: 'Qwen (Alibaba)',
  suno: 'Suno (Music)',
  udio: 'Udio (Music)',
  heygen: 'HeyGen (Avatar)',
  'd-id': 'D-ID (Avatar)',
  glm: 'GLM (Zhipu AI)',
  custom: 'Custom',
};

interface ModelOption {
  value: string;
  label: string;
  id: string;
}

interface ModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data: keysResponse, isLoading, isError } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiKeysApi.list(),
    enabled: isAuthenticated,
    retry: 1,
    staleTime: 30000,
  });

  if (!isAuthenticated) return null;

  const keys = keysResponse?.data ?? [];
  const options: ModelOption[] = keys.map((key) => {
    const providerLabel = PROVIDER_LABELS[key.provider] ?? key.provider;
    const val = key.model_name
      ? `${key.provider}::${key.model_name}`
      : key.provider;
    const label = key.model_name
      ? `${providerLabel} — ${key.model_name}`
      : providerLabel;
    return { value: val, label, id: key.id };
  });

  // Build display label for the selected value
  const selectedLabel = value
    ? options.find((o) => o.value === value)?.label ?? value
    : 'Auto';

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        <span>Loading...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-destructive/70">
        <Sparkles className="h-3 w-3" />
        <span>Model error</span>
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
        <Sparkles className="h-3 w-3" />
        <span>No model configured</span>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-auto border-0 bg-transparent p-0 text-xs text-muted-foreground hover:text-foreground gap-1 shadow-none focus:ring-0 [&>svg]:h-3 [&>svg]:w-3">
        <Sparkles className="h-3 w-3 shrink-0" />
        <SelectValue placeholder="Auto">
          {selectedLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="">Auto (default)</SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt.id} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

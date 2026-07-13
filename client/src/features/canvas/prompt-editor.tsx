'use client';

import { useState, useRef, useCallback } from 'react';
import type { CharacterData } from '@/types/canvas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ImagePlus,
  AtSign,
  Palette,
  ScanLine,
  FileJson,
  Wand2,
  X,
  Search,
  Download,
  Upload,
  Save,
  Sparkles,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types & Constants                                                  */
/* ------------------------------------------------------------------ */

interface Preset {
  id: string;
  name: string;
  prompt: string;
  stylePrompt: string;
  model: string;
  resolution: string;
  aspectRatio: string;
  createdAt: number;
}

const ASPECT_OPTIONS = [
  { label: '16:9', value: '16:9' },
  { label: '21:9', value: '21:9' },
  { label: '9:16', value: '9:16' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
  { label: '1:1', value: '1:1' },
];

const MODEL_OPTIONS = [
  { label: 'Flux Dev', value: 'flux-dev' },
  { label: 'Flux Pro', value: 'flux-pro' },
  { label: 'SDXL', value: 'sdxl' },
  { label: 'Midjourney', value: 'midjourney' },
  { label: 'DALL·E 3', value: 'dalle-3' },
];

const PRESETS_KEY = 'canvas_presets';

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePresets(presets: Preset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

/* ------------------------------------------------------------------ */
/*  Modal (simple portal, no Dialog/Radix dependency)                  */
/* ------------------------------------------------------------------ */

function SimpleModal({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50" />
      <div
        className="relative z-50 bg-background border rounded-lg shadow-lg max-w-md w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface PromptEditorProps {
  data: CharacterData;
  onUpdate: (patch: Partial<CharacterData>) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PromptEditor({ data, onUpdate }: PromptEditorProps) {
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [presetSearch, setPresetSearch] = useState('');
  const [presetName, setPresetName] = useState('');

  /* Modal states */
  const [showStyle, setShowStyle] = useState(false);
  const [styleText, setStyleText] = useState(data.stylePrompt ?? '');
  const [showRatio, setShowRatio] = useState(false);
  const [showPreset, setShowPreset] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [promptBuffer, setPromptBuffer] = useState(data.prompt ?? '');

  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const filteredPresets = presets.filter((p) =>
    p.name.toLowerCase().includes(presetSearch.toLowerCase())
  );

  /* ---- Sync ---- */
  const syncPrompt = useCallback(() => {
    onUpdate({ prompt: promptBuffer });
    setShowGenerate(false);
  }, [promptBuffer, onUpdate]);

  /* ---- Image ---- */
  const handleLocalImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onUpdate({ referenceImages: [...(data.referenceImages ?? []), url] });
    e.target.value = '';
  }, [data.referenceImages, onUpdate]);

  const removeRefImage = useCallback((idx: number) => {
    const arr = [...(data.referenceImages ?? [])];
    arr.splice(idx, 1);
    onUpdate({ referenceImages: arr });
  }, [data.referenceImages, onUpdate]);

  const insertAtMention = useCallback(() => {
    onUpdate({ prompt: (data.prompt ?? '') + '@{角色名}' });
  }, [data.prompt, onUpdate]);

  const applyStyle = useCallback(() => {
    onUpdate({ stylePrompt: styleText });
    setShowStyle(false);
  }, [styleText, onUpdate]);

  /* ---- Presets ---- */
  const createPreset = useCallback(() => {
    if (!presetName.trim()) return;
    const p: Preset = {
      id: crypto.randomUUID(),
      name: presetName.trim(),
      prompt: data.prompt ?? '',
      stylePrompt: data.stylePrompt ?? '',
      model: data.model ?? '',
      resolution: data.resolution ?? '2K',
      aspectRatio: data.aspectRatio ?? '16:9',
      createdAt: Date.now(),
    };
    const next = [...presets, p];
    setPresets(next); savePresets(next); setPresetName('');
  }, [presetName, presets, data]);

  const exportPresets = useCallback(() => {
    const blob = new Blob([JSON.stringify(presets, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'canvas_presets.json'; a.click();
    URL.revokeObjectURL(a.href);
  }, [presets]);

  const importPresets = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string);
        if (!Array.isArray(imported)) return;
        const merged = [...presets, ...imported];
        setPresets(merged); savePresets(merged);
      } catch { /* ignore */ }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [presets]);

  const loadPreset = useCallback((p: Preset) => {
    onUpdate({ prompt: p.prompt, stylePrompt: p.stylePrompt, model: p.model, resolution: p.resolution as any, aspectRatio: p.aspectRatio as any });
    setShowPreset(false);
  }, [onUpdate]);

  /* ================ RENDER ================ */

  return (
    <div className="space-y-3">
      {/* ── Prompt textarea with generate button ── */}
      <div className="space-y-1">
        <Label className="text-xs">提示词 (Prompt)</Label>
        <div className="relative">
          <textarea
            className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y pr-16"
            value={data.prompt ?? ''}
            onChange={(e) => onUpdate({ prompt: e.target.value })}
            rows={3}
            placeholder="输入角色生图提示词..."
          />
          <Button
            size="sm"
            className="absolute bottom-2 right-2 h-7 px-2 text-xs gap-1"
            onClick={() => { setPromptBuffer(data.prompt ?? ''); setShowGenerate(true); }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            生成
          </Button>
        </div>
      </div>

      {/* ── Generate modal ── */}
      <SimpleModal open={showGenerate} onClose={() => setShowGenerate(false)} title="编辑提示词">
        <div className="space-y-3">
          <textarea
            className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
            value={promptBuffer}
            onChange={(e) => setPromptBuffer(e.target.value)}
            rows={5}
            placeholder="编辑完整的提示词..."
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowGenerate(false)}>取消</Button>
            <Button size="sm" onClick={syncPrompt}>确认生成</Button>
          </div>
        </div>
      </SimpleModal>

      {/* ── Reference images ── */}
      {data.referenceImages && data.referenceImages.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.referenceImages.map((url, idx) => (
            <div key={idx} className="relative group">
              <img src={url} alt={`ref-${idx}`} className="w-12 h-12 object-cover rounded border" />
              <button className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100" onClick={() => removeRefImage(idx)}>
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLocalImage} />
      <input ref={importRef} type="file" accept=".json" className="hidden" onChange={importPresets} />

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => fileRef.current?.click()}>
          <ImagePlus className="w-3.5 h-3.5" />
        </Button>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={insertAtMention}>
          <AtSign className="w-3.5 h-3.5" />
        </Button>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => { setStyleText(data.stylePrompt ?? ''); setShowStyle(true); }}>
          <Palette className="w-3.5 h-3.5" />风格
        </Button>

        <Select value={data.model ?? ''} onValueChange={(v) => onUpdate({ model: v || undefined })}>
          <SelectTrigger className="h-7 px-2 text-xs w-[100px]"><SelectValue placeholder="模型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value=" ">默认</SelectItem>
            {MODEL_OPTIONS.map((m) => <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => setShowRatio(true)}>
          <ScanLine className="w-3.5 h-3.5" />比例
        </Button>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => setShowPreset(true)}>
          <FileJson className="w-3.5 h-3.5" />预设
        </Button>
        <Button variant="secondary" size="sm" className="h-7 px-2 text-xs gap-1 ml-auto" onClick={() => {}}>
          <Wand2 className="w-3.5 h-3.5" />优化
        </Button>
      </div>

      {/* ── Style modal ── */}
      <SimpleModal open={showStyle} onClose={() => setShowStyle(false)} title="风格提示词">
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
          value={styleText} onChange={(e) => setStyleText(e.target.value)} rows={3}
          placeholder="如水彩风格、赛博朋克、写实摄影..."
        />
        <div className="flex gap-2 justify-end mt-3">
          <Button variant="outline" size="sm" onClick={() => setShowStyle(false)}>取消</Button>
          <Button size="sm" onClick={applyStyle}>应用</Button>
        </div>
      </SimpleModal>

      {/* ── Ratio modal ── */}
      <SimpleModal open={showRatio} onClose={() => setShowRatio(false)} title="画面设置">
        <div className="space-y-3">
          <div>
            <Label className="text-xs mb-1 block">清晰度</Label>
            <div className="flex gap-2">
              {['2K', '4K'].map((r) => (
                <Button key={r} variant={data.resolution === r ? 'default' : 'outline'} size="sm" className="flex-1 h-8 text-xs" onClick={() => onUpdate({ resolution: r as any })}>{r}</Button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1 block">画面比例</Label>
            <div className="grid grid-cols-3 gap-2">
              {ASPECT_OPTIONS.map((a) => (
                <Button key={a.value} variant={data.aspectRatio === a.value ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => onUpdate({ aspectRatio: a.value as any })}>{a.label}</Button>
              ))}
            </div>
          </div>
        </div>
      </SimpleModal>

      {/* ── Preset modal ── */}
      <SimpleModal open={showPreset} onClose={() => setShowPreset(false)} title="提示词预设">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input className="h-8 pl-7 text-xs" placeholder="搜索预设..." value={presetSearch} onChange={(e) => setPresetSearch(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1 flex gap-1">
              <Input className="h-8 text-xs flex-1" placeholder="预设名称" value={presetName} onChange={(e) => setPresetName(e.target.value)} />
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={!presetName.trim()} onClick={createPreset}>
                <Save className="w-3.5 h-3.5" />
              </Button>
            </div>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => importRef.current?.click()}>
              <Upload className="w-3.5 h-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={presets.length === 0} onClick={exportPresets}>
              <Download className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {filteredPresets.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">{presetSearch ? '无匹配预设' : '暂无预设'}</p>}
            {filteredPresets.map((p) => (
              <button key={p.id} className="w-full text-left px-3 py-2 rounded-md border text-xs hover:bg-accent" onClick={() => loadPreset(p)}>
                <span className="font-medium">{p.name}</span>
                {p.prompt && <p className="text-muted-foreground truncate mt-0.5">{p.prompt}</p>}
              </button>
            ))}
          </div>
        </div>
      </SimpleModal>
    </div>
  );
}

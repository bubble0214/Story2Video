'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { useCanvasStore } from '@/stores/canvas-store';
import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { apiKeysApi } from '@/services/api-keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Loader2, Trash2, Link2, Unlink, User, Mountain, Image, Video, Music, FileText, StickyNote, X, Sparkles, Mic, Upload, Volume2 } from 'lucide-react';
import { useCanvasGenerate } from '@/hooks/use-canvas-generate';

import type { TextBlockData, NoteCardData, ImageBlockData, CharacterData, SceneData, AudioBlockData, AspectRatio, Resolution } from '@/types/canvas';

// ─── INLINED PromptEditor (avoids module parsing issues) ───
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ImagePlus, AtSign, Palette, ScanLine, FileJson, Wand2,
  Search, Download, Save,
} from 'lucide-react';

interface Preset {
  id: string; name: string; prompt: string; stylePrompt: string;
  model: string; resolution: string; aspectRatio: string; createdAt: number;
}
const ASPECTS = [{l:'16:9',v:'16:9'},{l:'21:9',v:'21:9'},{l:'9:16',v:'9:16'},{l:'4:3',v:'4:3'},{l:'3:4',v:'3:4'},{l:'1:1',v:'1:1'}];
const PK = 'canvas_presets';
function loadP(): Preset[] { try { const r = localStorage.getItem(PK); return r ? JSON.parse(r) : []; } catch { return []; } }
function saveP(p: Preset[]) { localStorage.setItem(PK, JSON.stringify(p)); }

function SimpleModal({open,onClose,title,children}:{open:boolean;onClose:()=>void;title:string;children:React.ReactNode}) {
  if(!open) return null;
  return (<div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
    <div className="fixed inset-0 bg-black/50" />
    <div className="relative z-50 bg-background border rounded-lg shadow-lg max-w-md w-full mx-4 p-6" onClick={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>
      {children}
    </div>
  </div>);
}

function InlinedPromptEditor({data,onUpdate,onGenerate}:{data:CharacterData;onUpdate:(p:Partial<CharacterData>)=>void;onGenerate?:()=>void}) {
  const [presets,setPresets]=useState<Preset[]>(loadP);
  const [ps,setPs]=useState(''); const [pn,setPn]=useState(''); const [pp,setPp]=useState('');
  const [showStyle,setShowStyle]=useState(false);
  const [st,setSt]=useState(data.stylePrompt??'');
  const [showRatio,setShowRatio]=useState(false);
  const [showPreset,setShowPreset]=useState(false);
  const [showGen,setShowGen]=useState(false);
  const [showAsset,setShowAsset]=useState(false);
  const [buf,setBuf]=useState(data.prompt??'');
  const fileRef=useRef<HTMLInputElement>(null);
  const importRef=useRef<HTMLInputElement>(null);
  const voiceFileRef=useRef<HTMLInputElement>(null);
  const fp = presets.filter(p=>p.name.toLowerCase().includes(ps.toLowerCase()));
  const allCharacterNames = useMemo(()=>useCanvasStore.getState().nodes.filter(n=>n.data?.type==='character').map(n=>(n.data as CharacterData).characterName).filter((n): n is string => !!n),[]);
  const {data:keysResponse}=useQuery({queryKey:['api-keys'],queryFn:()=>apiKeysApi.list()});
  const userModels = useMemo(()=>{
    const keys = keysResponse?.data??[];
    const models = keys.map(k=>({provider:k.provider,model:k.model_name})).filter(m=>m.model);
    const seen = new Set<string>();
    return models.filter(m=>{if(seen.has(m.model!))return false;seen.add(m.model!);return true;});
  },[keysResponse]);

  const hImg=(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(!f)return;onUpdate({referenceImages:[...(data.referenceImages??[]),URL.createObjectURL(f)]});e.target.value=''};
  const hVoice=(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(!f)return;onUpdate({voiceFileUrl:URL.createObjectURL(f)});e.target.value=''};

  const {data:assetTasks}=useQuery({queryKey:['asset-tasks'],queryFn:()=>tasksApi.list({limit:50}),enabled:showAsset});
  const assetItems = useMemo(()=>(assetTasks?.data?.items??[]).filter(t=>t.status==='SUCCESS'&&t.result?.result_url),[assetTasks]);
  const rmImg=(i:number)=>{const a=[...(data.referenceImages??[])];a.splice(i,1);onUpdate({referenceImages:a})};
  const applyStyle=()=>{onUpdate({stylePrompt:st});setShowStyle(false)};
  const mkPreset=()=>{if(!pn.trim()||!pp.trim())return;const p:Preset={id:crypto.randomUUID(),name:pn.trim(),prompt:pp,stylePrompt:data.stylePrompt??'',model:data.model??'',resolution:data.resolution??'2K',aspectRatio:data.aspectRatio??'16:9',createdAt:Date.now()};const n=[...presets,p];setPresets(n);saveP(n);setPn('');setPp('')};
  const delPreset=(id:string)=>{const n=presets.filter(p=>p.id!==id);setPresets(n);saveP(n)};
  const expPresets=()=>{const b=new Blob([JSON.stringify(presets,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='canvas_presets.json';a.click();URL.revokeObjectURL(a.href)};
  const impPresets=(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=(ev)=>{try{const i=JSON.parse(ev.target?.result as string);if(!Array.isArray(i))return;const m=[...presets,...i];setPresets(m);saveP(m)}catch{}};r.readAsText(f);e.target.value=''};
  const loadPreset=(p:Preset)=>{onUpdate({prompt:p.prompt,stylePrompt:p.stylePrompt,model:p.model,resolution:p.resolution as any,aspectRatio:p.aspectRatio as any});setShowPreset(false)};

  return (<div className="space-y-3">
    {/* ── 角色信息 ── */}
    <div className="space-y-1">
      <Label className="text-xs">角色名称</Label>
      <div className="flex gap-1">
        <Input className="h-8 text-xs flex-1" value={data.characterName??''} onChange={e=>onUpdate({characterName:e.target.value})} placeholder="输入角色名称" />
        {allCharacterNames.length>0&&<Select value="" onValueChange={v=>onUpdate({characterName:v})}>
          <SelectTrigger className="h-8 w-16 text-xs"><SelectValue placeholder="选择" /></SelectTrigger>
          <SelectContent>{[...new Set(allCharacterNames)].map(n=><SelectItem key={n} value={n} className="text-xs">{n}</SelectItem>)}</SelectContent>
        </Select>}
      </div>
    </div>
    <div className="space-y-1">
      <Label className="text-xs">形象名称</Label>
      <Input className="h-8 text-xs" value={data.baseCharacter??''} onChange={e=>onUpdate({baseCharacter:e.target.value})} placeholder="输入形象名称" />
    </div>
    <div className="space-y-1">
      <Label className="text-xs">出现集数</Label>
      <Input className="h-8 text-xs" value={data.appearanceCount??''} onChange={e=>onUpdate({appearanceCount:parseInt(e.target.value)||0})} placeholder="第几集" />
    </div>
    {/* ── 提示词 ── */}
    <div className="space-y-1">
      <Label className="text-xs">提示词 (Prompt)</Label>
      <div className="relative">
        <textarea className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y pr-16" value={data.prompt??''} onChange={e=>onUpdate({prompt:e.target.value})} rows={3} placeholder="输入角色生图提示词..." />
        <Button size="sm" className="absolute bottom-2 right-2 h-7 px-2 text-xs gap-1" onClick={()=>{setBuf(data.prompt??'');setShowGen(true)}}><Sparkles className="w-3.5 h-3.5" />生成</Button>
      </div>
    </div>

    <SimpleModal open={showGen} onClose={()=>setShowGen(false)} title="编辑提示词">
      <textarea className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y" value={buf} onChange={e=>setBuf(e.target.value)} rows={5} placeholder="编辑完整的提示词..." />
      <div className="flex gap-2 justify-end mt-3">
        <Button variant="outline" size="sm" onClick={()=>setShowGen(false)}>取消</Button>
        <Button size="sm" onClick={()=>{onUpdate({prompt:buf});setShowGen(false);onGenerate?.()}}>确认生成</Button>
      </div>
    </SimpleModal>

    {data.referenceImages&&data.referenceImages.length>0&&(<div className="flex flex-wrap gap-1.5">
      {data.referenceImages.map((url,i)=>(<div key={i} className="relative group">
        <img src={url} alt={`r-${i}`} className="w-12 h-12 object-cover rounded border" />
        <button className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100" onClick={()=>rmImg(i)}><X className="w-3 h-3" /></button>
      </div>))}
    </div>)}

    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={hImg} />
    <input ref={importRef} type="file" accept=".json" className="hidden" onChange={impPresets} />

    <div className="flex flex-wrap items-center gap-1.5">
      <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="添加参考图片" onClick={()=>fileRef.current?.click()}><ImagePlus className="w-3.5 h-3.5" /></Button>
      <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="引用素材" onClick={()=>setShowAsset(true)}><AtSign className="w-3.5 h-3.5" /></Button>
      <Button variant="outline" size="sm" className="h-7 w-7 p-0" title={data.stylePrompt||'风格提示词'} onClick={()=>{setSt(data.stylePrompt??'');setShowStyle(true)}}><Palette className="w-3.5 h-3.5" /></Button>
      <Select value={data.model??''} onValueChange={v=>onUpdate({model:v||undefined})}>
        <SelectTrigger className="h-7 px-2 text-xs w-auto min-w-[48px] max-w-[100px]"><SelectValue placeholder="Auto" /></SelectTrigger>
        <SelectContent>
          {userModels.length===0
            ?<SelectItem value="" disabled className="text-xs">请先在设置页配置模型</SelectItem>
            :userModels.map(m=><SelectItem key={m.model!} value={m.model!} className="text-xs">{m.provider}: {m.model}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="画面比例/清晰度" onClick={()=>setShowRatio(true)}><ScanLine className="w-3.5 h-3.5" /></Button>
      <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="提示词预设" onClick={()=>setShowPreset(true)}><FileJson className="w-3.5 h-3.5" /></Button>
      <Button variant="secondary" size="sm" className="h-7 px-2 text-xs gap-1 ml-auto" onClick={onGenerate}><Wand2 className="w-3.5 h-3.5" />优化</Button>
    </div>

    {/* ── 音色 ── */}
    <Separator />
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1"><Mic className="w-3 h-3" />音色参考</Label>
      <div className="grid grid-cols-2 gap-2">
        {/* Text voice — editable */}
        <div className="rounded-md border bg-muted/30 p-2.5 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Mic className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-medium">文字描述</span>
          </div>
          <textarea className="flex min-h-[48px] w-full rounded border border-border/50 bg-background px-2 py-1 text-[10px] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y" value={data.voiceDescription??''} onChange={e=>onUpdate({voiceDescription:e.target.value})} rows={2} placeholder="低沉磁性、清亮少女..." disabled={!!data.voiceRef} />
        </div>
        {/* Upload voice ref — real file input */}
        <div className="rounded-md border border-dashed flex flex-col items-center justify-center gap-1 p-2.5 cursor-pointer hover:bg-muted/50 transition-colors relative" onClick={()=>voiceFileRef.current?.click()}>
          <Upload className="h-4 w-4 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">上传参考音频</span>
          {data.voiceFileUrl&&<span className="text-[10px] text-primary truncate max-w-full mt-0.5">已上传</span>}
        </div>
        <input ref={voiceFileRef} type="file" accept="audio/*" className="hidden" onChange={hVoice} />
      </div>
      {/* Voice binding select */}
      {allCharacterNames.filter(n=>n!==data.characterName).length>0&&<div className="flex gap-2 items-center">
        <Select value={data.voiceRef??''} onValueChange={v=>onUpdate({voiceRef:v||undefined})}>
          <SelectTrigger className="h-7 text-xs flex-1 min-w-0"><SelectValue placeholder="绑定其他角色音色..." /></SelectTrigger>
          <SelectContent>{allCharacterNames.filter(n=>n!==data.characterName).map(n=><SelectItem key={n} value={n} className="text-xs">{n}</SelectItem>)}</SelectContent>
        </Select>
        {data.voiceRef&&<Button variant="ghost" size="sm" className="h-7 px-1.5 text-xs text-destructive shrink-0" onClick={()=>{onUpdate({voiceRef:undefined})}}>取消绑定</Button>}
      </div>}
      {data.voiceRef&&<p className="text-[10px] text-muted-foreground">已绑定角色「{data.voiceRef}」的音色</p>}
    </div>

    <SimpleModal open={showStyle} onClose={()=>setShowStyle(false)} title="风格提示词">
      <textarea className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y" value={st} onChange={e=>setSt(e.target.value)} rows={3} placeholder="如水彩风格、赛博朋克、写实摄影..." />
      <div className="flex gap-2 justify-end mt-3"><Button variant="outline" size="sm" onClick={()=>setShowStyle(false)}>取消</Button><Button size="sm" onClick={applyStyle}>应用</Button></div>
    </SimpleModal>

    <SimpleModal open={showRatio} onClose={()=>setShowRatio(false)} title="画面设置">
      <div className="space-y-3">
        <div><Label className="text-xs mb-1 block">清晰度</Label><div className="flex gap-2">{['2K','4K'].map(r=><Button key={r} variant={data.resolution===r?'default':'outline'} size="sm" className="flex-1 h-8 text-xs" onClick={()=>onUpdate({resolution:r as any})}>{r}</Button>)}</div></div>
        <div><Label className="text-xs mb-1 block">画面比例</Label><div className="grid grid-cols-3 gap-2">{ASPECTS.map(a=><Button key={a.v} variant={data.aspectRatio===a.v?'default':'outline'} size="sm" className="h-8 text-xs" onClick={()=>onUpdate({aspectRatio:a.v as any})}>{a.l}</Button>)}</div></div>
      </div>
    </SimpleModal>

    <SimpleModal open={showPreset} onClose={()=>setShowPreset(false)} title="提示词预设">
      <div className="space-y-3">
        <div className="relative"><Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><Input className="h-8 pl-7 text-xs" placeholder="搜索预设..." value={ps} onChange={e=>setPs(e.target.value)} /></div>
        <div className="border rounded-md p-3 space-y-2 bg-muted/30">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">新建预设</p>
          <Input className="h-8 text-xs" placeholder="预设名称" value={pn} onChange={e=>setPn(e.target.value)} />
          <textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-y" value={pp} onChange={e=>setPp(e.target.value)} rows={2} placeholder="输入提示词内容..." />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" disabled={!pn.trim()||!pp.trim()} onClick={()=>{setPn('');setPp('')}}>清空</Button>
            <Button size="sm" className="flex-1 h-7 text-xs" disabled={!pn.trim()||!pp.trim()} onClick={mkPreset}><Save className="w-3 h-3 mr-1" />保存预设</Button>
          </div>
        </div>
        <div className="flex gap-2 justify-end"><Button variant="outline" size="sm" className="h-7 text-xs" onClick={()=>importRef.current?.click()}><Upload className="w-3 h-3 mr-1" />导入</Button><Button variant="outline" size="sm" className="h-7 text-xs" disabled={presets.length===0} onClick={expPresets}><Download className="w-3 h-3 mr-1" />导出</Button></div>
        <div className="max-h-40 overflow-y-auto space-y-1">{fp.length===0?<p className="text-xs text-muted-foreground text-center py-4">{ps?'无匹配预设':'暂无预设'}</p>:fp.map(p=><div key={p.id} className="flex items-start gap-1 group"><button className="flex-1 text-left px-3 py-2 rounded-md border text-xs hover:bg-accent" onClick={()=>loadPreset(p)}><span className="font-medium">{p.name}</span>{p.prompt&&<p className="text-muted-foreground truncate mt-0.5">{p.prompt}</p>}</button><button className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-opacity mt-1" onClick={()=>delPreset(p.id)}><Trash2 className="w-3 h-3" /></button></div>)}</div>
      </div>
    </SimpleModal>

    {/* ── 引用素材 ── */}
    <SimpleModal open={showAsset} onClose={()=>setShowAsset(false)} title="引用素材">
      <div className="max-h-64 overflow-y-auto space-y-2">
        {assetItems.length===0
          ?<p className="text-xs text-muted-foreground text-center py-8">暂无已完成的任务素材</p>
          :assetItems.map(t=>{
            const url = (t.result as any)?.result_url??'';
            return <div key={t.id} className="flex items-center gap-3 p-2 rounded-md border hover:bg-accent cursor-pointer" onClick={()=>{onUpdate({prompt:(data.prompt??'')+` [ref:${t.id}]`});setShowAsset(false)}}>
              {url.match(/\.(png|jpg|jpeg|webp|gif)/i)
                ?<img src={url} alt="" className="w-10 h-10 object-cover rounded shrink-0" />
                :<div className="w-10 h-10 bg-muted rounded flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-muted-foreground" /></div>}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{t.workflow_type}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</p>
              </div>
            </div>})}
      </div>
    </SimpleModal>
  </div>);
}

function InlinedSceneEditor({data,onUpdate,onGenerate}:{data:SceneData;onUpdate:(p:Partial<SceneData>)=>void;onGenerate?:()=>void}) {
  const [presets,setPresets]=useState<Preset[]>(loadP);
  const [ps,setPs]=useState(''); const [pn,setPn]=useState(''); const [pp,setPp]=useState('');
  const [showStyle,setShowStyle]=useState(false);
  const [st,setSt]=useState(data.stylePrompt??'');
  const [showRatio,setShowRatio]=useState(false);
  const [showPreset,setShowPreset]=useState(false);
  const [showAsset,setShowAsset]=useState(false);
  const [showGen,setShowGen]=useState(false);
  const [buf,setBuf]=useState(data.prompt??'');
  const fileRef=useRef<HTMLInputElement>(null);
  const importRef=useRef<HTMLInputElement>(null);
  const audioFileRef=useRef<HTMLInputElement>(null);
  const fp = presets.filter(p=>p.name.toLowerCase().includes(ps.toLowerCase()));
  const {data:keysResponse}=useQuery({queryKey:['api-keys-scene'],queryFn:()=>apiKeysApi.list()});
  const userModels = useMemo(()=>{
    const keys = keysResponse?.data??[];
    const models = keys.map(k=>({provider:k.provider,model:k.model_name})).filter(m=>m.model);
    const seen = new Set<string>();
    return models.filter(m=>{if(seen.has(m.model!))return false;seen.add(m.model!);return true;});
  },[keysResponse]);
  const {data:assetTasks}=useQuery({queryKey:['asset-tasks-scene'],queryFn:()=>tasksApi.list({limit:50}),enabled:showAsset});
  const assetItems = useMemo(()=>(assetTasks?.data?.items??[]).filter(t=>t.status==='SUCCESS'&&t.result?.result_url),[assetTasks]);

  const hImg=(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(!f)return;onUpdate({referenceImages:[...(data.referenceImages??[]),URL.createObjectURL(f)]});e.target.value=''};
  const hAudio=(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(!f)return;onUpdate({ambientAudioUrl:URL.createObjectURL(f)});e.target.value=''};
  const rmImg=(i:number)=>{const a=[...(data.referenceImages??[])];a.splice(i,1);onUpdate({referenceImages:a})};
  const mkPreset=()=>{if(!pn.trim()||!pp.trim())return;const p:Preset={id:crypto.randomUUID(),name:pn.trim(),prompt:pp,stylePrompt:data.stylePrompt??'',model:data.model??'',resolution:data.resolution??'2K',aspectRatio:data.aspectRatio??'16:9',createdAt:Date.now()};const n=[...presets,p];setPresets(n);saveP(n);setPn('');setPp('')};
  const delPreset=(id:string)=>{const n=presets.filter(p=>p.id!==id);setPresets(n);saveP(n)};
  const expPresets=()=>{const b=new Blob([JSON.stringify(presets,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='canvas_presets.json';a.click();URL.revokeObjectURL(a.href)};
  const impPresets=(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=(ev)=>{try{const i=JSON.parse(ev.target?.result as string);if(!Array.isArray(i))return;const m=[...presets,...i];setPresets(m);saveP(m)}catch{}};r.readAsText(f);e.target.value=''};
  const loadPreset=(p:Preset)=>{onUpdate({prompt:p.prompt,stylePrompt:p.stylePrompt,model:p.model,resolution:p.resolution as any,aspectRatio:p.aspectRatio as any});setShowPreset(false)};

  return (<div className="space-y-3">
    {/* ── 场景信息 ── */}
    <div className="space-y-1">
      <Label className="text-xs">场景名称</Label>
      <Input className="h-8 text-xs" value={data.sceneName??''} onChange={e=>onUpdate({sceneName:e.target.value})} placeholder="输入场景名称" />
    </div>
    <div className="space-y-1">
      <Label className="text-xs">基础场景</Label>
      <Select value={data.baseScene??''} onValueChange={v=>onUpdate({baseScene:v||undefined})}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="选择基础场景..." /></SelectTrigger>
        <SelectContent>
          <SelectItem value="" className="text-xs">无</SelectItem>
          <SelectItem value="default-ext" className="text-xs">默认外景</SelectItem>
          <SelectItem value="default-int" className="text-xs">默认内景</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-1">
      <Label className="text-xs">出现集数</Label>
      <Input className="h-8 text-xs" value={data.appearanceCount??''} onChange={e=>onUpdate({appearanceCount:parseInt(e.target.value)||0})} placeholder="第几集" />
    </div>

    {/* ── 提示词 ── */}
    <div className="space-y-1">
      <Label className="text-xs">提示词 (Prompt)</Label>
      <div className="relative">
        <textarea className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y pr-16" value={data.prompt??''} onChange={e=>onUpdate({prompt:e.target.value})} rows={3} placeholder="输入场景生图提示词..." />
        <Button size="sm" className="absolute bottom-2 right-2 h-7 px-2 text-xs gap-1" onClick={()=>{setBuf(data.prompt??'');setShowGen(true)}}><Sparkles className="w-3.5 h-3.5" />生成</Button>
      </div>
    </div>

    <SimpleModal open={showGen} onClose={()=>setShowGen(false)} title="编辑提示词">
      <textarea className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y" value={buf} onChange={e=>setBuf(e.target.value)} rows={5} />
      <div className="flex gap-2 justify-end mt-3">
        <Button variant="outline" size="sm" onClick={()=>setShowGen(false)}>取消</Button>
        <Button size="sm" onClick={()=>{onUpdate({prompt:buf});setShowGen(false);onGenerate?.()}}>确认</Button>
      </div>
    </SimpleModal>

    {data.referenceImages&&data.referenceImages.length>0&&(<div className="flex flex-wrap gap-1.5">
      {data.referenceImages.map((url,i)=>(<div key={i} className="relative group">
        <img src={url} alt={`r-${i}`} className="w-12 h-12 object-cover rounded border" />
        <button className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100" onClick={()=>rmImg(i)}><X className="w-3 h-3" /></button>
      </div>))}
    </div>)}
    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={hImg} />
    <input ref={importRef} type="file" accept=".json" className="hidden" onChange={impPresets} />

    <div className="flex flex-wrap items-center gap-1.5">
      <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="添加参考图片" onClick={()=>fileRef.current?.click()}><ImagePlus className="w-3.5 h-3.5" /></Button>
      <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="引用素材" onClick={()=>setShowAsset(true)}><AtSign className="w-3.5 h-3.5" /></Button>
      <Button variant="outline" size="sm" className="h-7 w-7 p-0" title={data.stylePrompt||'风格提示词'} onClick={()=>{setSt(data.stylePrompt??'');setShowStyle(true)}}><Palette className="w-3.5 h-3.5" /></Button>
      <Select value={data.model??''} onValueChange={v=>onUpdate({model:v||undefined})}>
        <SelectTrigger className="h-7 px-2 text-xs w-auto min-w-[48px] max-w-[100px]"><SelectValue placeholder="Auto" /></SelectTrigger>
        <SelectContent>
          {userModels.length===0
            ?<SelectItem value="" disabled className="text-xs">请先在设置页配置模型</SelectItem>
            :userModels.map(m=><SelectItem key={m.model!} value={m.model!} className="text-xs">{m.provider}: {m.model}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="画面比例/清晰度" onClick={()=>setShowRatio(true)}><ScanLine className="w-3.5 h-3.5" /></Button>
      <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="提示词预设" onClick={()=>setShowPreset(true)}><FileJson className="w-3.5 h-3.5" /></Button>
    </div>

    <SimpleModal open={showStyle} onClose={()=>setShowStyle(false)} title="风格提示词">
      <textarea className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y" value={st} onChange={e=>setSt(e.target.value)} rows={3} placeholder="如水彩风格、赛博朋克、写实摄影..." />
      <div className="flex gap-2 justify-end mt-3"><Button variant="outline" size="sm" onClick={()=>setShowStyle(false)}>取消</Button><Button size="sm" onClick={()=>{onUpdate({stylePrompt:st});setShowStyle(false)}}>应用</Button></div>
    </SimpleModal>

    <SimpleModal open={showRatio} onClose={()=>setShowRatio(false)} title="画面设置">
      <div className="space-y-3">
        <div><Label className="text-xs mb-1 block">清晰度</Label><div className="flex gap-2">{['2K','4K'].map(r=><Button key={r} variant={data.resolution===r?'default':'outline'} size="sm" className="flex-1 h-8 text-xs" onClick={()=>onUpdate({resolution:r as any})}>{r}</Button>)}</div></div>
        <div><Label className="text-xs mb-1 block">画面比例</Label><div className="grid grid-cols-3 gap-2">{ASPECTS.map(a=><Button key={a.v} variant={data.aspectRatio===a.v?'default':'outline'} size="sm" className="h-8 text-xs" onClick={()=>onUpdate({aspectRatio:a.v as any})}>{a.l}</Button>)}</div></div>
      </div>
    </SimpleModal>

    <SimpleModal open={showPreset} onClose={()=>setShowPreset(false)} title="提示词预设">
      <div className="space-y-3">
        <div className="relative"><Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><Input className="h-8 pl-7 text-xs" placeholder="搜索预设..." value={ps} onChange={e=>setPs(e.target.value)} /></div>
        <div className="border rounded-md p-3 space-y-2 bg-muted/30">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">新建预设</p>
          <Input className="h-8 text-xs" placeholder="预设名称" value={pn} onChange={e=>setPn(e.target.value)} />
          <textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-y" value={pp} onChange={e=>setPp(e.target.value)} rows={2} placeholder="输入提示词内容..." />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" disabled={!pn.trim()||!pp.trim()} onClick={()=>{setPn('');setPp('')}}>清空</Button>
            <Button size="sm" className="flex-1 h-7 text-xs" disabled={!pn.trim()||!pp.trim()} onClick={mkPreset}><Save className="w-3 h-3 mr-1" />保存预设</Button>
          </div>
        </div>
        <div className="flex gap-2 justify-end"><Button variant="outline" size="sm" className="h-7 text-xs" onClick={()=>importRef.current?.click()}><Upload className="w-3 h-3 mr-1" />导入</Button><Button variant="outline" size="sm" className="h-7 text-xs" disabled={presets.length===0} onClick={expPresets}><Download className="w-3 h-3 mr-1" />导出</Button></div>
        <div className="max-h-40 overflow-y-auto space-y-1">{fp.length===0?<p className="text-xs text-muted-foreground text-center py-4">{ps?'无匹配预设':'暂无预设'}</p>:fp.map(p=><div key={p.id} className="flex items-start gap-1 group"><button className="flex-1 text-left px-3 py-2 rounded-md border text-xs hover:bg-accent" onClick={()=>loadPreset(p)}><span className="font-medium">{p.name}</span>{p.prompt&&<p className="text-muted-foreground truncate mt-0.5">{p.prompt}</p>}</button><button className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-opacity mt-1" onClick={()=>delPreset(p.id)}><Trash2 className="w-3 h-3" /></button></div>)}</div>
      </div>
    </SimpleModal>

    <SimpleModal open={showAsset} onClose={()=>setShowAsset(false)} title="引用素材">
      <div className="max-h-64 overflow-y-auto space-y-2">
        {assetItems.length===0
          ?<p className="text-xs text-muted-foreground text-center py-8">暂无已完成的任务素材</p>
          :assetItems.map(t=>{
            const url = (t.result as any)?.result_url??'';
            return <div key={t.id} className="flex items-center gap-3 p-2 rounded-md border hover:bg-accent cursor-pointer" onClick={()=>{onUpdate({prompt:(data.prompt??'')+` [ref:${t.id}]`});setShowAsset(false)}}>
              {url.match(/\.(png|jpg|jpeg|webp|gif)/i)
                ?<img src={url} alt="" className="w-10 h-10 object-cover rounded shrink-0" />
                :<div className="w-10 h-10 bg-muted rounded flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-muted-foreground" /></div>}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{t.workflow_type}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</p>
              </div>
            </div>})}
      </div>
    </SimpleModal>

    {/* ── 背景音效 ── */}
    <Separator />
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1"><Volume2 className="w-3 h-3" />背景音效</Label>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border bg-muted/30 p-2.5 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Volume2 className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-medium">文字描述</span>
          </div>
          <textarea className="flex min-h-[48px] w-full rounded border border-border/50 bg-background px-2 py-1 text-[10px] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y" value={data.ambientSound??''} onChange={e=>onUpdate({ambientSound:e.target.value})} rows={2} placeholder="雨声、风声、街道嘈杂..." />
        </div>
        <div className="rounded-md border border-dashed flex flex-col items-center justify-center gap-1 p-2.5 cursor-pointer hover:bg-muted/50 transition-colors relative" onClick={()=>audioFileRef.current?.click()}>
          <Upload className="h-4 w-4 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">上传音效</span>
          {data.ambientAudioUrl&&<span className="text-[10px] text-primary truncate max-w-full mt-0.5">已上传</span>}
        </div>
        <input ref={audioFileRef} type="file" accept="audio/*" className="hidden" onChange={hAudio} />
      </div>
    </div>
  </div>);
}

function InlinedImageEditor({data,onUpdate,onGenerate}:{data:ImageBlockData;onUpdate:(p:Partial<ImageBlockData>)=>void;onGenerate?:()=>void}) {
  const [presets,setPresets]=useState<Preset[]>(loadP);
  const [ps,setPs]=useState(''); const [pn,setPn]=useState(''); const [pp,setPp]=useState('');
  const [showStyle,setShowStyle]=useState(false);
  const [st,setSt]=useState(data.stylePrompt??'');
  const [showRatio,setShowRatio]=useState(false);
  const [showPreset,setShowPreset]=useState(false);
  const [showAsset,setShowAsset]=useState(false);
  const [showGen,setShowGen]=useState(false);
  const [buf,setBuf]=useState(data.prompt??'');
  const fileRef=useRef<HTMLInputElement>(null);
  const importRef=useRef<HTMLInputElement>(null);
  const fp = presets.filter(p=>p.name.toLowerCase().includes(ps.toLowerCase()));
  const {data:keysResponse}=useQuery({queryKey:['api-keys-img'],queryFn:()=>apiKeysApi.list()});
  const userModels = useMemo(()=>{
    const keys = keysResponse?.data??[];
    const models = keys.map(k=>({provider:k.provider,model:k.model_name})).filter(m=>m.model);
    const seen = new Set<string>();
    return models.filter(m=>{if(seen.has(m.model!))return false;seen.add(m.model!);return true;});
  },[keysResponse]);
  const {data:assetTasks}=useQuery({queryKey:['asset-tasks-img'],queryFn:()=>tasksApi.list({limit:50}),enabled:showAsset});
  const assetItems = useMemo(()=>(assetTasks?.data?.items??[]).filter(t=>t.status==='SUCCESS'&&t.result?.result_url),[assetTasks]);

  const hImg=(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(!f)return;onUpdate({referenceImages:[...(data.referenceImages??[]),URL.createObjectURL(f)]});e.target.value=''};
  const rmImg=(i:number)=>{const a=[...(data.referenceImages??[])];a.splice(i,1);onUpdate({referenceImages:a})};
  const mkPreset=()=>{if(!pn.trim()||!pp.trim())return;const p:Preset={id:crypto.randomUUID(),name:pn.trim(),prompt:pp,stylePrompt:data.stylePrompt??'',model:data.model??'',resolution:data.resolution??'2K',aspectRatio:data.aspectRatio??'16:9',createdAt:Date.now()};const n=[...presets,p];setPresets(n);saveP(n);setPn('');setPp('')};
  const delPreset=(id:string)=>{const n=presets.filter(p=>p.id!==id);setPresets(n);saveP(n)};
  const expPresets=()=>{const b=new Blob([JSON.stringify(presets,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='canvas_presets.json';a.click();URL.revokeObjectURL(a.href)};
  const impPresets=(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=(ev)=>{try{const i=JSON.parse(ev.target?.result as string);if(!Array.isArray(i))return;const m=[...presets,...i];setPresets(m);saveP(m)}catch{}};r.readAsText(f);e.target.value=''};
  const loadPreset=(p:Preset)=>{onUpdate({prompt:p.prompt,stylePrompt:p.stylePrompt,model:p.model,resolution:p.resolution as any,aspectRatio:p.aspectRatio as any});setShowPreset(false)};

  return (<div className="space-y-3">
    {/* ── 提示词 ── */}
    <div className="space-y-1">
      <Label className="text-xs">提示词 (Prompt)</Label>
      <div className="relative">
        <textarea className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y pr-16" value={data.prompt??''} onChange={e=>onUpdate({prompt:e.target.value})} rows={3} placeholder="输入图片生成提示词..." />
        <Button size="sm" className="absolute bottom-2 right-2 h-7 px-2 text-xs gap-1" onClick={()=>{setBuf(data.prompt??'');setShowGen(true)}}><Sparkles className="w-3.5 h-3.5" />生成</Button>
      </div>
    </div>

    <SimpleModal open={showGen} onClose={()=>setShowGen(false)} title="编辑提示词">
      <textarea className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y" value={buf} onChange={e=>setBuf(e.target.value)} rows={5} />
      <div className="flex gap-2 justify-end mt-3">
        <Button variant="outline" size="sm" onClick={()=>setShowGen(false)}>取消</Button>
        <Button size="sm" onClick={()=>{onUpdate({prompt:buf});setShowGen(false);onGenerate?.()}}>确认</Button>
      </div>
    </SimpleModal>

    {data.referenceImages&&data.referenceImages.length>0&&(<div className="flex flex-wrap gap-1.5">
      {data.referenceImages.map((url,i)=>(<div key={i} className="relative group">
        <img src={url} alt={`r-${i}`} className="w-12 h-12 object-cover rounded border" />
        <button className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100" onClick={()=>rmImg(i)}><X className="w-3 h-3" /></button>
      </div>))}
    </div>)}
    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={hImg} />
    <input ref={importRef} type="file" accept=".json" className="hidden" onChange={impPresets} />

    <div className="flex flex-wrap items-center gap-1.5">
      <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="添加参考图片" onClick={()=>fileRef.current?.click()}><ImagePlus className="w-3.5 h-3.5" /></Button>
      <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="引用素材" onClick={()=>setShowAsset(true)}><AtSign className="w-3.5 h-3.5" /></Button>
      <Button variant="outline" size="sm" className="h-7 w-7 p-0" title={data.stylePrompt||'风格提示词'} onClick={()=>{setSt(data.stylePrompt??'');setShowStyle(true)}}><Palette className="w-3.5 h-3.5" /></Button>
      <Select value={data.model??''} onValueChange={v=>onUpdate({model:v||undefined})}>
        <SelectTrigger className="h-7 px-2 text-xs w-auto min-w-[48px] max-w-[100px]"><SelectValue placeholder="Auto" /></SelectTrigger>
        <SelectContent>
          {userModels.length===0
            ?<SelectItem value="" disabled className="text-xs">请先在设置页配置模型</SelectItem>
            :userModels.map(m=><SelectItem key={m.model!} value={m.model!} className="text-xs">{m.provider}: {m.model}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="画面比例/清晰度" onClick={()=>setShowRatio(true)}><ScanLine className="w-3.5 h-3.5" /></Button>
      <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="提示词预设" onClick={()=>setShowPreset(true)}><FileJson className="w-3.5 h-3.5" /></Button>
    </div>

    <SimpleModal open={showStyle} onClose={()=>setShowStyle(false)} title="风格提示词">
      <textarea className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y" value={st} onChange={e=>setSt(e.target.value)} rows={3} placeholder="如水彩风格、赛博朋克、写实摄影..." />
      <div className="flex gap-2 justify-end mt-3"><Button variant="outline" size="sm" onClick={()=>setShowStyle(false)}>取消</Button><Button size="sm" onClick={()=>{onUpdate({stylePrompt:st});setShowStyle(false)}}>应用</Button></div>
    </SimpleModal>

    <SimpleModal open={showRatio} onClose={()=>setShowRatio(false)} title="画面设置">
      <div className="space-y-3">
        <div><Label className="text-xs mb-1 block">清晰度</Label><div className="flex gap-2">{['2K','4K'].map(r=><Button key={r} variant={data.resolution===r?'default':'outline'} size="sm" className="flex-1 h-8 text-xs" onClick={()=>onUpdate({resolution:r as any})}>{r}</Button>)}</div></div>
        <div><Label className="text-xs mb-1 block">画面比例</Label><div className="grid grid-cols-3 gap-2">{ASPECTS.map(a=><Button key={a.v} variant={data.aspectRatio===a.v?'default':'outline'} size="sm" className="h-8 text-xs" onClick={()=>onUpdate({aspectRatio:a.v as any})}>{a.l}</Button>)}</div></div>
      </div>
    </SimpleModal>

    <SimpleModal open={showPreset} onClose={()=>setShowPreset(false)} title="提示词预设">
      <div className="space-y-3">
        <div className="relative"><Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><Input className="h-8 pl-7 text-xs" placeholder="搜索预设..." value={ps} onChange={e=>setPs(e.target.value)} /></div>
        <div className="border rounded-md p-3 space-y-2 bg-muted/30">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase">新建预设</p>
          <Input className="h-8 text-xs" placeholder="预设名称" value={pn} onChange={e=>setPn(e.target.value)} />
          <textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-y" value={pp} onChange={e=>setPp(e.target.value)} rows={2} placeholder="输入提示词内容..." />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" disabled={!pn.trim()||!pp.trim()} onClick={()=>{setPn('');setPp('')}}>清空</Button>
            <Button size="sm" className="flex-1 h-7 text-xs" disabled={!pn.trim()||!pp.trim()} onClick={mkPreset}><Save className="w-3 h-3 mr-1" />保存预设</Button>
          </div>
        </div>
        <div className="flex gap-2 justify-end"><Button variant="outline" size="sm" className="h-7 text-xs" onClick={()=>importRef.current?.click()}><Upload className="w-3 h-3 mr-1" />导入</Button><Button variant="outline" size="sm" className="h-7 text-xs" disabled={presets.length===0} onClick={expPresets}><Download className="w-3 h-3 mr-1" />导出</Button></div>
        <div className="max-h-40 overflow-y-auto space-y-1">{fp.length===0?<p className="text-xs text-muted-foreground text-center py-4">{ps?'无匹配预设':'暂无预设'}</p>:fp.map(p=><div key={p.id} className="flex items-start gap-1 group"><button className="flex-1 text-left px-3 py-2 rounded-md border text-xs hover:bg-accent" onClick={()=>loadPreset(p)}><span className="font-medium">{p.name}</span>{p.prompt&&<p className="text-muted-foreground truncate mt-0.5">{p.prompt}</p>}</button><button className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-opacity mt-1" onClick={()=>delPreset(p.id)}><Trash2 className="w-3 h-3" /></button></div>)}</div>
      </div>
    </SimpleModal>

    <SimpleModal open={showAsset} onClose={()=>setShowAsset(false)} title="引用素材">
      <div className="max-h-64 overflow-y-auto space-y-2">
        {assetItems.length===0
          ?<p className="text-xs text-muted-foreground text-center py-8">暂无已完成的任务素材</p>
          :assetItems.map(t=>{
            const url = (t.result as any)?.result_url??'';
            return <div key={t.id} className="flex items-center gap-3 p-2 rounded-md border hover:bg-accent cursor-pointer" onClick={()=>{onUpdate({prompt:(data.prompt??'')+` [ref:${t.id}]`});setShowAsset(false)}}>
              {url.match(/\.(png|jpg|jpeg|webp|gif)/i)
                ?<img src={url} alt="" className="w-10 h-10 object-cover rounded shrink-0" />
                :<div className="w-10 h-10 bg-muted rounded flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-muted-foreground" /></div>}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{t.workflow_type}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</p>
              </div>
            </div>})}
      </div>
    </SimpleModal>
  </div>);
}

export function NodePanel() {
  const { selectedNodeId, nodes, updateNodeData, removeSelectedNode } = useCanvasStore();
  const [linkTaskId, setLinkTaskId] = useState('');
  const [showImgAsset, setShowImgAsset] = useState(false);
  const [showAudioStyle, setShowAudioStyle] = useState(false);
  const [audioStyle, setAudioStyle] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasGenerate = useCanvasGenerate();

  const { data: assetTasks } = useQuery({
    queryKey: ['asset-tasks-panel'],
    queryFn: () => tasksApi.list({ limit: 50 }),
    enabled: showImgAsset,
  });
  const assetItems = useMemo(
    () => (assetTasks?.data?.items ?? []).filter((t) => t.status === 'SUCCESS' && t.result?.result_url),
    [assetTasks],
  );

  const {data:audioKeys}=useQuery({queryKey:['api-keys-audio'],queryFn:()=>apiKeysApi.list()});
  const audioModels = useMemo(()=>{
    const keys = audioKeys?.data??[];
    const models = keys.map(k=>({provider:k.provider,model:k.model_name})).filter(m=>m.model);
    const seen = new Set<string>();
    return models.filter(m=>{if(seen.has(m.model!))return false;seen.add(m.model!);return true;});
  },[audioKeys]);

  const handleLocalImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !selectedNodeId) return;
    updateNodeData(selectedNodeId, { imageUrl: URL.createObjectURL(f) } as Partial<TextBlockData>);
    e.target.value = '';
  };

  const handleGenerate = useCallback(() => {
    if (!selectedNodeId || !data) return;
    const nodeType = data.type;
    if (nodeType !== 'character' && nodeType !== 'scene' && nodeType !== 'imageBlock') return;
    const nodeData = data as CharacterData | SceneData | ImageBlockData;
    canvasGenerate.generate({
      nodeId: selectedNodeId,
      nodeType: nodeType as 'character' | 'scene' | 'imageBlock',
      prompt: nodeData.prompt ?? '',
      stylePrompt: nodeData.stylePrompt,
      model: nodeData.model,
      resolution: nodeData.resolution,
      aspectRatio: nodeData.aspectRatio,
      referenceImages: nodeData.referenceImages,
    });
  }, [selectedNodeId, data, canvasGenerate.generate]);

  const handleAssetSelect = (url: string) => {
    if (!selectedNodeId) return;
    updateNodeData(selectedNodeId, { imageUrl: url } as Partial<TextBlockData>);
    setShowImgAsset(false);
  };

  const node = nodes.find((n) => n.id === selectedNodeId);
  const data = node?.data;

  const { data: tasksResponse } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: () => tasksApi.list({ limit: 20 }),
    enabled: !!selectedNodeId,
  });

  if (!selectedNodeId || !node || !data) {
    return (
      <div className="w-64 border-l bg-background p-4">
        <p className="text-xs text-muted-foreground text-center pt-8">
          选择节点编辑属性
        </p>
      </div>
    );
  }

  const tasks = tasksResponse?.data?.items ?? [];

  const handleLink = () => {
    if (!linkTaskId) return;
    const task = tasks.find((t) => t.id === linkTaskId);
    updateNodeData(node.id, {
      linkedTaskId: linkTaskId,
      linkedNovelTitle: task?.workflow_type ?? 'Linked task',
    } as Partial<TextBlockData & ImageBlockData>);
    setLinkTaskId('');
  };

  const handleUnlink = () => {
    updateNodeData(node.id, {
      linkedTaskId: undefined,
      linkedNovelTitle: undefined,
    } as Partial<TextBlockData & ImageBlockData>);
  };

  const getNodeIcon = () => {
    switch (data.type) {
      case 'character': return <User className="h-4 w-4" />;
      case 'scene': return <Mountain className="h-4 w-4" />;
      case 'imageBlock': return <Image className="h-4 w-4" />;
      case 'videoBlock': return <Video className="h-4 w-4" />;
      case 'audioBlock': return <Music className="h-4 w-4" />;
      case 'textBlock': return <FileText className="h-4 w-4" />;
      case 'noteCard': return <StickyNote className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  return (<>
    <div className="w-64 border-l bg-background flex flex-col">
      <div className="px-4 py-3 border-b flex items-center gap-2">
        {getNodeIcon()}
        <p className="text-sm font-semibold truncate flex-1">{(data as CharacterData).characterName ?? data.label}</p>
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={() => useCanvasStore.getState().setSelectedNodeId(null)}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {canvasGenerate.isGenerating && (
        <div className="px-4 py-2 border-b bg-blue-500/10 flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
          <span className="text-xs text-blue-600">图片生成中...</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Character-specific fields */}

        {/* Character-specific fields */}
        {data.type === 'character' && (
          <InlinedPromptEditor
            data={data as CharacterData}
            onUpdate={(patch) => updateNodeData(node.id, patch as Partial<CharacterData>)}
            onGenerate={handleGenerate}
          />
        )}

        {/* Scene-specific fields */}
        {data.type === 'scene' && (
          <InlinedSceneEditor
            data={data as SceneData}
            onUpdate={(patch) => updateNodeData(node.id, patch as Partial<SceneData>)}
            onGenerate={handleGenerate}
          />
        )}

        {/* Content (textBlock / noteCard) */}
        {(data.type === 'textBlock' || data.type === 'noteCard') && (
          <div className="space-y-1">
            <Label className="text-xs">内容</Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
              value={(data as TextBlockData | NoteCardData).content}
              onChange={(e) => updateNodeData(node.id, { content: e.target.value } as Partial<TextBlockData & NoteCardData>)}
              rows={3}
            />
          </div>
        )}

        {/* Image (textBlock only) */}
        {data.type === 'textBlock' && (
          <div className="space-y-2">
            <Label className="text-xs">图片</Label>
            {(data as TextBlockData).imageUrl && (
              <div className="relative w-full aspect-video rounded-md overflow-hidden border mb-2">
                <img src={(data as TextBlockData).imageUrl} alt={(data as TextBlockData).imageAlt ?? ''} className="w-full h-full object-cover" />
                <button className="absolute top-1 right-1 bg-background/80 rounded-full w-5 h-5 flex items-center justify-center hover:bg-background" onClick={() => updateNodeData(node.id, { imageUrl: undefined } as Partial<TextBlockData>)}><X className="w-3 h-3" /></button>
              </div>
            )}
            <div className="flex gap-2">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLocalImage} />
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => fileRef.current?.click()}><Upload className="w-3 h-3" />本地上传</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowImgAsset(true)}><Image className="w-3 h-3" />资产库</Button>
            </div>
          </div>
        )}

        {/* Video URL (videoBlock) */}
        {data.type === 'videoBlock' && (
          <div className="space-y-1">
            <Label className="text-xs">视频 URL</Label>
            <Input
              className="h-8 text-xs"
              value={(data as any).videoUrl ?? ''}
              onChange={(e) => updateNodeData(node.id, { videoUrl: e.target.value } as Partial<Record<string, unknown>>)}
              placeholder="https://..."
            />
          </div>
        )}

        {/* Audio (audioBlock) */}
        {data.type === 'audioBlock' && (
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">提示词 (Prompt)</Label>
              <textarea
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                value={(data as AudioBlockData).prompt ?? ''}
                onChange={(e) => updateNodeData(node.id, { prompt: e.target.value } as Partial<AudioBlockData>)}
                rows={2}
                placeholder="输入音频生成提示词..."
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="风格提示词" onClick={()=>{setAudioStyle((data as AudioBlockData).stylePrompt??'');setShowAudioStyle(true)}}><Palette className="w-3.5 h-3.5" /></Button>
              <Select value={(data as AudioBlockData).model??''} onValueChange={v=>updateNodeData(node.id,{model:v||undefined} as Partial<AudioBlockData>)}>
                <SelectTrigger className="h-7 px-2 text-xs w-auto min-w-[48px] max-w-[100px]"><SelectValue placeholder="Auto" /></SelectTrigger>
                <SelectContent>
                  {audioModels.length===0
                    ?<SelectItem value="" disabled className="text-xs">请先在设置页配置模型</SelectItem>
                    :audioModels.map(m=><SelectItem key={m.model!} value={m.model!} className="text-xs">{m.provider}: {m.model}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">音频 URL</Label>
              <Input
                className="h-8 text-xs"
                value={(data as AudioBlockData).audioUrl ?? ''}
                onChange={(e) => updateNodeData(node.id, { audioUrl: e.target.value } as Partial<AudioBlockData>)}
                placeholder="https://..."
              />
            </div>
            <SimpleModal open={showAudioStyle} onClose={()=>setShowAudioStyle(false)} title="风格提示词">
              <textarea className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y" value={audioStyle} onChange={e=>setAudioStyle(e.target.value)} rows={3} placeholder="音频风格描述..." />
              <div className="flex gap-2 justify-end mt-3"><Button variant="outline" size="sm" onClick={()=>setShowAudioStyle(false)}>取消</Button><Button size="sm" onClick={()=>{updateNodeData(node.id,{stylePrompt:audioStyle} as Partial<AudioBlockData>);setShowAudioStyle(false)}}>应用</Button></div>
            </SimpleModal>
          </div>
        )}

        {/* Note color (noteCard) */}
        {data.type === 'noteCard' && (
          <div className="space-y-1">
            <Label className="text-xs">颜色</Label>
            <input
              type="color"
              className="h-8 w-full rounded border border-input cursor-pointer"
              value={(data as NoteCardData).color}
              onChange={(e) => updateNodeData(node.id, { color: e.target.value } as Partial<NoteCardData>)}
            />
          </div>
        )}

        {/* Image block editor */}
        {data.type === 'imageBlock' && <InlinedImageEditor data={data as ImageBlockData} onUpdate={(patch) => updateNodeData(node.id, patch as Partial<ImageBlockData>)} onGenerate={handleGenerate} />}

        <Separator />

        {/* Link to novel/task (for textBlock and imageBlock) */}
        {(data.type === 'textBlock' || data.type === 'imageBlock') && (
          <div className="space-y-2">
            <Label className="text-xs">链接到项目</Label>
            {(data as TextBlockData).linkedTaskId ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-primary truncate">
                  {(data as TextBlockData).linkedNovelTitle ?? 'Linked'}
                </span>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleUnlink}>
                  <Unlink className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-1">
                <Select value={linkTaskId} onValueChange={setLinkTaskId}>
                  <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                    <SelectValue placeholder="选择..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tasks.map((t) => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">
                        {t.workflow_type} — {t.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={!linkTaskId}
                  onClick={handleLink}
                >
                  <Link2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete */}
      <div className="px-4 py-3 border-t">
        <Button
          variant="destructive"
          size="sm"
          className="w-full h-8 text-xs"
          onClick={() => { if (window.confirm('确定删除此节点吗？')) removeSelectedNode(); }}
        >
          <Trash2 className="h-3 w-3 mr-1" />
          删除节点
        </Button>
      </div>
    </div>

    <SimpleModal open={showImgAsset} onClose={()=>setShowImgAsset(false)} title="选择图片">
      <div className="max-h-64 overflow-y-auto space-y-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLocalImage} />
        <button className="w-full text-left px-3 py-2 rounded-md border text-xs hover:bg-accent mb-2" onClick={()=>{setShowImgAsset(false);fileRef.current?.click()}}>本地上传</button>
        {assetItems.length===0
          ?<p className="text-xs text-muted-foreground text-center py-4">暂无已完成的任务素材</p>
          :assetItems.map(t=>{
            const url = (t.result as any)?.result_url??'';
            return <div key={t.id} className="flex items-center gap-3 p-2 rounded-md border hover:bg-accent cursor-pointer" onClick={()=>handleAssetSelect(url)}>
              {url.match(/\.(png|jpg|jpeg|webp|gif)/i)
                ?<img src={url} alt="" className="w-10 h-10 object-cover rounded shrink-0" />
                :<div className="w-10 h-10 bg-muted rounded flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-muted-foreground" /></div>}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{t.workflow_type}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</p>
              </div>
            </div>})}
      </div>
    </SimpleModal>
  </>);
}
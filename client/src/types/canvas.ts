import type { Node, Edge } from '@xyflow/react';

export type AssetCategory = 'character' | 'scene' | 'prop' | 'material';

export type CanvasNodeType =
  | 'textBlock'
  | 'imageBlock'
  | 'noteCard'
  | 'character'
  | 'scene'
  | 'videoBlock'
  | 'audioBlock';

interface BaseNodeData extends Record<string, unknown> {
  label: string;
  updatedAt: string;
}

export interface TextBlockData extends BaseNodeData {
  type: 'textBlock';
  content: string;
  linkedTaskId?: string;
  linkedNovelTitle?: string;
  imageUrl?: string;
  imageAlt?: string;
}

export interface ImageBlockData extends BaseNodeData {
  type: 'imageBlock';
  imageUrl: string;
  altText?: string;
  linkedTaskId?: string;
  linkedNovelTitle?: string;
  /** AI image generation prompt */
  prompt?: string;
  /** Reference image URLs */
  referenceImages?: string[];
  /** Style prompt */
  stylePrompt?: string;
  /** Image generation model */
  model?: string;
  /** Output resolution */
  resolution?: Resolution;
  /** Aspect ratio */
  aspectRatio?: AspectRatio;
}

export interface NoteCardData extends BaseNodeData {
  type: 'noteCard';
  content: string;
  color: string;
}

export type Resolution = '2K' | '4K';
export type AspectRatio = '16:9' | '21:9' | '9:16' | '4:3' | '3:4' | '1:1';

export interface CharacterData extends BaseNodeData {
  type: 'character';
  characterName?: string;
  image?: string;
  imageUrl?: string;
  baseCharacter?: string;
  description?: string;
  appearanceCount?: number;
  voiceRef?: string;
  /** Voice description text (free text, overridden when bound) */
  voiceDescription?: string;
  /** Uploaded voice reference file URL */
  voiceFileUrl?: string;
  lightSettings?: LightSettings;
  cameraSettings?: CameraSettings;
  /** AI image generation prompt */
  prompt?: string;
  /** Reference image URLs */
  referenceImages?: string[];
  /** Style prompt */
  stylePrompt?: string;
  /** Image generation model */
  model?: string;
  /** Output resolution */
  resolution?: Resolution;
  /** Aspect ratio */
  aspectRatio?: AspectRatio;
  /** Associated preset ID */
  presetId?: string;
}

export interface SceneData extends BaseNodeData {
  type: 'scene';
  sceneName?: string;
  image?: string;
  imageUrl?: string;
  baseScene?: string;
  description?: string;
  appearanceCount?: number;
  panoramicUrl?: string;
  cameraSettings?: CameraSettings;
  /** AI image generation prompt */
  prompt?: string;
  /** Reference image URLs */
  referenceImages?: string[];
  /** Style prompt */
  stylePrompt?: string;
  /** Image generation model */
  model?: string;
  /** Output resolution */
  resolution?: Resolution;
  /** Aspect ratio */
  aspectRatio?: AspectRatio;
  /** Background ambient sound text description */
  ambientSound?: string;
  /** Background ambient sound audio file URL */
  ambientAudioUrl?: string;
}

export interface VideoBlockData extends BaseNodeData {
  type: 'videoBlock';
  videoUrl?: string;
  duration?: number;
}

export interface AudioBlockData extends BaseNodeData {
  type: 'audioBlock';
  audioUrl?: string;
  duration?: number;
  prompt?: string;
  stylePrompt?: string;
  model?: string;
}

export type CanvasNodeData =
  | TextBlockData
  | ImageBlockData
  | NoteCardData
  | CharacterData
  | SceneData
  | VideoBlockData
  | AudioBlockData;

export interface CanvasEdgeData extends Record<string, unknown> {
  label?: string;
  relationship?: string;
}

export interface CanvasData {
  nodes: Node<CanvasNodeData>[];
  edges: Edge<CanvasEdgeData>[];
  viewport?: { x: number; y: number; zoom: number };
}

export interface CanvasMetadata {
  id: string;
  title: string;
  data: CanvasData;
  created_at: string;
  updated_at: string;
}

export interface CreateCanvasReq {
  title: string;
}

export interface UpdateCanvasReq {
  title?: string;
  data?: CanvasData;
}

export interface CanvasListItem {
  id: string;
  title: string;
  updated_at: string;
}

export interface LightSettings {
  horizontal?: number;
  vertical?: number;
  intensity?: number;
  fill?: number;
  colorTemp?: number;
  prompt?: string;
}

export interface CameraSettings {
  horizontal?: number;
  vertical?: number;
  shot?: string;
  composition?: string;
  prompt?: string;
}
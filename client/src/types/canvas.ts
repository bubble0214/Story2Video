import type { Node, Edge } from '@xyflow/react';

export type CanvasNodeType = 'textBlock' | 'imageBlock' | 'noteCard';

interface BaseNodeData extends Record<string, unknown> {
  label: string;
  updatedAt: string;
}

export interface TextBlockData extends BaseNodeData {
  type: 'textBlock';
  content: string;
  linkedTaskId?: string;
  linkedNovelTitle?: string;
}

export interface ImageBlockData extends BaseNodeData {
  type: 'imageBlock';
  imageUrl: string;
  altText?: string;
  linkedTaskId?: string;
  linkedNovelTitle?: string;
}

export interface NoteCardData extends BaseNodeData {
  type: 'noteCard';
  content: string;
  color: string;
}

export type CanvasNodeData = TextBlockData | ImageBlockData | NoteCardData;

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

import type { WorkflowType } from './task';

export type WorkflowMode = 'novel' | 'script' | 'script-gen' | 'lyrics' | 'song' | 'image' | 'video' | 'mv';

export const WORKFLOW_MODE_TO_TYPE: Partial<Record<WorkflowMode, WorkflowType>> = {
  script: 'generate_script',
  'script-gen': 'generate_script',
  lyrics: 'generate_lyrics',
  song: 'generate_song',
  image: 'generate_image',
  video: 'generate_video',
  mv: 'generate_mv',
};

export const WORKFLOW_TYPE_TO_MODE: Record<string, WorkflowMode> = {
  generate_novel: 'novel',
  generate_script: 'script',
  generate_lyrics: 'lyrics',
  generate_song: 'song',
  generate_image: 'image',
  generate_video: 'video',
  generate_mv: 'mv',
};

export interface CharacterSettings {
  genre: string;
  format: string;
  tone: string;
}

export interface WorkflowState {
  keywords: string;
  workflowMode: WorkflowMode;
  selectedNovelId: string | null;
  completedSteps: WorkflowType[];
  currentTaskId: string | null;
  customPrompt: string;
  novelContent: string;
  novelTweetContent: string;
  videoTweetContent: string;
  outlineContent: string;
  volumeOutlineContent: string;
  characterRulesContent: string;
  characterSettings: CharacterSettings;
}

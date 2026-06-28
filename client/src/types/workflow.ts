import type { WorkflowType } from './task';

export type WorkflowMode = 'novel' | 'script' | 'lyrics' | 'song' | 'image' | 'video';

export const WORKFLOW_MODE_TO_TYPE: Partial<Record<WorkflowMode, WorkflowType>> = {
  script: 'generate_script',
  lyrics: 'generate_lyrics',
  song: 'generate_song',
  image: 'generate_image',
  video: 'generate_video',
};

export const WORKFLOW_TYPE_TO_MODE: Record<string, WorkflowMode> = {
  generate_novel: 'novel',
  generate_script: 'script',
  generate_lyrics: 'lyrics',
  generate_song: 'song',
  generate_image: 'image',
  generate_video: 'video',
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

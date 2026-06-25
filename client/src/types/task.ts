export type WorkflowType =
  | 'generate_novel'
  | 'generate_outline_only'
  | 'generate_volume_outline_only'
  | 'generate_character_rules_only'
  | 'generate_novel_with_outline'
  | 'generate_novel_with_volume_outline'
  | 'generate_novel_with_character_rules'
  | 'generate_script'
  | 'generate_novel_tweet'
  | 'generate_video_tweet'
  | 'generate_storyboard'
  | 'generate_lyrics'
  | 'generate_song'
  | 'generate_image'
  | 'generate_video';

export interface CreateTaskReq {
  workflow_type: WorkflowType;
  input_params: Record<string, unknown>;
}

export interface TaskResp {
  id: string;
  user_id: string;
  workflow_type: string;
  status: string;
  progress: number;
  current_step: string;
  error_message: string;
  result: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TaskListResp {
  items: TaskResp[];
  total: number;
  limit: number;
  offset: number;
}

export type TaskStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';

export interface MusicGenerateReq {
  lyrics: string;
  style?: string;
}

export interface MusicGenerateResp {
  audio_url: string;
}

export interface AvatarVideoReq {
  audio_url: string;
  avatar_id: string;
}

export interface AvatarVideoResp {
  video_url: string;
}

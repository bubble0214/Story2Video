export type WorkflowType =
  | 'generate_outline_only'
  | 'generate_volume_outline_only'
  | 'generate_character_rules_only'
  | 'generate_script'
  | 'generate_analyze_novel'
  | 'generate_script_structure'
  | 'generate_scene_outline'
  | 'generate_script_diagnosis'
  | 'generate_single_scene'
  | 'generate_scene_diagnosis'
  | 'generate_novel_tweet'
  | 'generate_video_tweet'
  | 'generate_storyboard'
  | 'generate_lyrics'
  | 'extract_lyrics_core'
  | 'generate_song'
  | 'generate_music_style'
  | 'generate_image'
  | 'canvas_generate_image'
  | 'canvas_parse_script'
  | 'generate_video'
  | 'generate_mv'
  | 'generate_mv_storyboard';

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

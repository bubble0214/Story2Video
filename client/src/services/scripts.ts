import { tasksApi } from './tasks';

export interface GenerateSceneReq {
  scene_index: number;
  scene_num?: string;
  scene_raw: string;
  scene_location: string;
  scene_summary: string;
  scene_characters: string;
  accumulated_context: string;
  total_scenes: number;
  novel_content?: string;
  novel_analysis?: string;
  character_setting_prompt?: string;
  chosen_structure?: string;
  structure_content?: string;
  prompt?: string;
  model?: string;
}

export interface DiagnoseReq {
  scenes_text: string;
  model?: string;
}

export interface SceneDiagnosisResp {
  script_diagnosis: string;
  modified_scenes: Record<string, string>;
}

export const scriptsApi = {
  generateScene: (params: GenerateSceneReq) =>
    tasksApi.create({
      workflow_type: 'generate_single_scene',
      input_params: params as unknown as Record<string, unknown>,
    }),

  diagnose: (params: DiagnoseReq) =>
    tasksApi.create({
      workflow_type: 'generate_scene_diagnosis',
      input_params: params as unknown as Record<string, unknown>,
    }),
};

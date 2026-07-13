export interface CreateApiKeyReq {
  provider: string;
  key: string;
  base_url?: string;
  model_name?: string;
  coze_space_id?: string;
  coze_billing_project_id?: string;
}

export interface ApiKeyResp {
  id: string;
  provider: string;
  base_url?: string;
  model_name?: string;
  coze_space_id?: string;
  coze_billing_project_id?: string;
  created_at: string;
}

export interface TestApiKeyReq {
  provider: string;
  key?: string;
  base_url?: string;
  model_name?: string;
}

export interface TestApiKeyResp {
  success: boolean;
  message: string;
}

export interface CozeBotInfo {
  bot_id: string;
  name: string;
  is_published: boolean;
}

export interface CozeWorkspaceInfo {
  space_id: string;
  name: string;
  billing_project_id?: string;
  bots: CozeBotInfo[];
}

export interface CozeDiscoverReq {
  api_key: string;
  base_url?: string;
}

export interface CozeDiscoverResp {
  workspaces: CozeWorkspaceInfo[];
}

export interface CozeCreateBotReq {
  api_key: string;
  space_id: string;
  name: string;
  description?: string;
  base_url?: string;
}

export interface CozeCreateBotResp {
  bot_id: string;
  name: string;
  is_published: boolean;
}

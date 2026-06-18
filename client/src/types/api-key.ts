export interface CreateApiKeyReq {
  provider: string;
  key: string;
  base_url?: string;
  model_name?: string;
}

export interface ApiKeyResp {
  id: string;
  provider: string;
  base_url?: string;
  model_name?: string;
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

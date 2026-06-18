export interface LoginReq {
  email: string;
  password: string;
}

export interface RegisterReq {
  email: string;
  password: string;
}

export interface TokenPairResp {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface RefreshReq {
  refresh_token: string;
}

export interface UserResp {
  id: string;
  email: string;
  created_at: string;
  updated_at: string | null;
}

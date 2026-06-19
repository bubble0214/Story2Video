export interface SearchNovelReq {
  keywords: string[];
}

export interface SearchResultItem {
  id?: string;  // absent for LLM-recommended novels not in DB
  title: string;
  author: string;
  tags: string;
  summary: string;
  score: number;
}

export interface NovelResp {
  id: string;
  title: string;
  author: string;
  tags: string;
  summary: string;
  created_at: string;
}

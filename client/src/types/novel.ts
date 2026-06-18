export interface SearchNovelReq {
  keywords: string[];
}

export interface SearchResultItem {
  id: string;
  title: string;
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

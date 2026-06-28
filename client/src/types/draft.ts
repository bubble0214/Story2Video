import type { SearchResultItem } from './novel';

// ── Novel-specific step data ──
export interface NovelDraftStepData {
  schema_version?: number;
  keywords?: string;
  customPrompt?: string;
  genModel?: string;
  references?: SearchResultItem[];
  analysis?: string;
  outlineText?: string;
  volumeOutlineText?: string;
  characterRulesText?: string;
  novelContent?: string;
  chapters?: { title: string; content: string }[];
  totalChapters?: number;
  generateMode?: 'batch' | 'interactive';
  qualityReport?: string | null;
  qualityRevisions?: ChapterRevision[];
  qualityRevisionsSummary?: string;
  // Volume review state (interactive mode)
  volumeReviewState?: 'pending_review' | 'executing_v2' | 'executing_closing' | 'pending_final_review' | 'completed' | null;
  volumeReviewReport?: VolumeReviewReport | null;
  volumeReviewDecision?: string | null;
  volume2Outline?: string | null;
  volume2ChaptersWritten?: number;
  closingChaptersWritten?: number;
  // Final review (when v2/closing arc completes)
  finalReviewReport?: string | null;
  finalReviewRevisions?: ChapterRevision[];
  finalReviewApplied?: boolean;
}

export type DraftStepData = Record<string, unknown>;

export interface Draft {
  id: string;
  title: string;
  workflow_type: string;
  draft_group_id?: string;
  status: 'in_progress' | 'completed';
  current_step: string;
  step_data: DraftStepData;
  created_at: string;
  updated_at: string;
}

export interface DraftListItem {
  id: string;
  title: string;
  workflow_type: string;
  draft_group_id?: string;
  status: string;
  current_step: string;
  updated_at: string;
}

export interface CreateDraftReq {
  title?: string;
  workflow_type: string;
  draft_group_id?: string;
}

export interface UpsertDraftReq {
  title?: string;
  workflow_type: string;
  current_step: string;
  step_data: DraftStepData;
}

export interface UpdateDraftReq {
  title?: string;
  status?: string;
  current_step?: string;
  step_data?: DraftStepData;
}

// Novel-specific generate-chapter types
export interface GenerateChapterReq {
  gen_model?: string;
  chapter_num?: number;
}

export interface VolumeReviewReport {
  review_text: string;
  decision: string;
  parsed_decision: string;
  analysis_summary: string;
}

export interface VolumeReviewResp {
  volume_review_report: VolumeReviewReport;
  chapter_count: number;
  total_chapters: number;
  volume_2_outline?: string | null;
  revised_chapters?: { title: string; content: string }[] | null;
}

export interface GenerateChapterResp {
  chapter_num: number;
  chapter_title: string;
  chapter_content: string;
  total_chapters: number;
  draft: Draft;
  quality_check_needed?: boolean;
  volume_review?: VolumeReviewResp | null;
  final_review?: FinalReviewResp | null;
}

export interface FinalReviewResp {
  report: string;
  chapter_count: number;
  total_chapters: number;
  revised_chapters?: { chapter_index: number; title: string; content: string }[] | null;
}

export interface VolumeReviewDecisionReq {
  decision: '续写第二卷' | '修改后继续' | '收束结局';
  apply_revisions?: boolean;
}

export interface SubmitVolumeDecisionResp {
  message: string;
  volume_2_outline?: string | null;
  new_total_chapters: number;
  draft: Draft;
}

export interface ChapterRevision {
  chapter_index: number;
  title: string;
  content: string;
}

export interface AnalyzeChaptersResp {
  report: string;
  revisions: ChapterRevision[];
  revisions_summary: string;
}

export interface FinalNovelDecisionReq {
  apply_revisions?: boolean;
  mark_complete?: boolean;
}

export interface FinalNovelDecisionResp {
  message: string;
  draft: Draft;
}

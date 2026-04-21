export type UserRole = "admin" | "contributor" | "developer" | "moderator";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  email_verified: boolean;
}

export interface GameHub {
  id: number;
  name: string;
  slug: string;
}

export interface Tag {
  id: number;
  name: string;
}

export interface PostAuthor {
  id: number;
  username: string;
  reputation_score: number;
  is_trusted: boolean;
}

export type PostStatus = "draft" | "published" | "deleted";

export interface Post {
  id: number;
  game_hub: GameHub;
  author: PostAuthor;
  title: string;
  body: string;
  tags: Tag[];
  is_question: boolean;
  has_spoilers: boolean;
  status: PostStatus;
  is_edited: boolean;
  is_priority: boolean;
  created_at: string;
  updated_at: string;
  vote_score: number;
  upvote_count: number;
  downvote_count: number;
  current_user_vote: number;
  comment_count: number;
}

export interface PostComment {
  id: number;
  author: PostAuthor;
  body: string;
  attachment_name: string | null;
  attachment_url: string | null;
  created_at: string;
}

export interface ApiError {
  error: string;
}

export interface ApiMessage {
  message: string;
}

export interface PostVoteSummary {
  vote_score: number;
  upvote_count: number;
  downvote_count: number;
  current_user_vote: number;
}

export interface ModeratorAccessRequest {
  id: number;
  user: AuthUser;
  reason: string;
  status: "pending" | "approved" | "rejected";
  review_note: string;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by_username: string | null;
}

export type ModerationReportStatus = "open" | "actioned" | "escalated" | "dismissed";
export type ModerationActionType = "warn" | "remove" | "escalate" | "dismiss";

export interface ModerationQueueItem {
  id: number;
  game_hub: GameHub;
  author: PostAuthor;
  title: string;
  body: string;
  tags: Tag[];
  is_question: boolean;
  has_spoilers: boolean;
  status: PostStatus;
  report_status: ModerationReportStatus;
  created_at: string;
  updated_at: string;
  report_count: number;
  latest_report_reason: string | null;
  latest_reported_at: string | null;
  latest_action: ModerationActionType | null;
  latest_action_note: string | null;
  latest_action_at: string | null;
}

export interface PostModerationReport {
  id: number;
  reason: string;
  status: string;
  created_at: string;
}

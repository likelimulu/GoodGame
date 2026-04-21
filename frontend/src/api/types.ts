export type UserRole = "admin" | "contributor" | "developer" | "moderator";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: UserRole;
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

export interface PostModerationReport {
  id: number;
  reason: string;
  status: string;
  created_at: string;
}

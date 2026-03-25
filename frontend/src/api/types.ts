export interface AuthUser {
  id: number;
  username: string;
  email: string;
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
}

export interface ApiError {
  error: string;
}

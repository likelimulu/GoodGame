from datetime import datetime
from typing import List, Literal, Optional

from ninja import Schema


# ── Auth schemas ──────────────────────────────────────────────


class SignupIn(Schema):
    username: str
    password: str
    email: str


class SignupOut(Schema):
    id: int
    username: str


class LoginIn(Schema):
    username: str
    password: str
    remember_me: bool = False


class AuthUserOut(Schema):
    id: int
    username: str
    email: str


class ErrorOut(Schema):
    error: str


class MessageOut(Schema):
    message: str


# ── GameHub schemas ───────────────────────────────────────────


class GameHubOut(Schema):
    id: int
    name: str
    slug: str


# ── Tag schemas ───────────────────────────────────────────────


class TagOut(Schema):
    id: int
    name: str


# ── Post schemas ──────────────────────────────────────────────


class PostIn(Schema):
    game_hub_id: int
    title: str
    body: str
    tags: List[str] = []
    is_question: bool = False
    has_spoilers: bool = False
    status: str = "published"  # "published" or "draft"


class PostUpdateIn(Schema):
    title: Optional[str] = None
    body: Optional[str] = None
    tags: Optional[List[str]] = None
    is_question: Optional[bool] = None
    has_spoilers: Optional[bool] = None
    status: Optional[str] = None


class PostAuthorOut(Schema):
    id: int
    username: str


class PostVoteSummaryOut(Schema):
    vote_score: int
    upvote_count: int
    downvote_count: int
    current_user_vote: int = 0


class PostOut(Schema):
    id: int
    game_hub: GameHubOut
    author: PostAuthorOut
    title: str
    body: str
    tags: List[TagOut]
    is_question: bool
    has_spoilers: bool
    status: str
    is_edited: bool
    created_at: datetime
    updated_at: datetime
    vote_score: int
    upvote_count: int
    downvote_count: int
    current_user_vote: int = 0


class PostVoteIn(Schema):
    value: Literal[-1, 0, 1]

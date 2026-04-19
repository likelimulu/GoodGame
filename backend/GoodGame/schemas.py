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
    role: str

    @staticmethod
    def resolve_role(obj):
        return obj.profile.role


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
    game_hub_id: Optional[int] = None
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


class PostCommentAuthorOut(Schema):
    id: int
    username: str


class PostCommentOut(Schema):
    id: int
    author: PostCommentAuthorOut
    body: str
    attachment_name: Optional[str] = None
    attachment_url: Optional[str] = None
    created_at: datetime


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
    comment_count: int = 0


class PostVoteIn(Schema):
    value: Literal[-1, 0, 1]


class PostReportCreateIn(Schema):
    reason: str


class PostReportAuthorOut(Schema):
    id: int
    username: str


class PostModerationReportOut(Schema):
    id: int
    post_id: int
    reporter: PostReportAuthorOut
    reason: str
    status: str
    reviewed_at: Optional[datetime] = None
    reviewed_by_username: Optional[str] = None
    created_at: datetime

    @staticmethod
    def resolve_reviewed_by_username(obj):
        return obj.reviewed_by.username if obj.reviewed_by else None


class PostModerationActionIn(Schema):
    action: Literal["warn", "remove", "escalate", "dismiss"]
    note: str = ""


class ModerationQueueItemOut(Schema):
    id: int
    game_hub: GameHubOut
    author: PostAuthorOut
    title: str
    body: str
    tags: List[TagOut]
    is_question: bool
    has_spoilers: bool
    status: str
    created_at: datetime
    updated_at: datetime
    report_count: int
    latest_report_reason: Optional[str] = None
    latest_reported_at: Optional[datetime] = None
    latest_action: Optional[str] = None
    latest_action_note: Optional[str] = None
    latest_action_at: Optional[datetime] = None


# ── User profile schemas ───────────────────────────────────────────────────────


class AvatarOut(Schema):
    url: str


class UserRoleIn(Schema):
    role: Literal["admin", "contributor", "developer", "moderator"]


class UserRoleOut(Schema):
    id: int
    username: str
    role: str


class ModeratorRequestCreateIn(Schema):
    reason: str = ""


class ModeratorRequestReviewIn(Schema):
    status: Literal["approved", "rejected"]
    review_note: str = ""


class ModeratorRequestUserOut(Schema):
    id: int
    username: str
    email: str
    role: str

    @staticmethod
    def resolve_role(obj):
        return obj.profile.role


class ModeratorRequestOut(Schema):
    id: int
    user: ModeratorRequestUserOut
    reason: str
    status: str
    review_note: str
    requested_at: datetime
    reviewed_at: Optional[datetime] = None
    reviewed_by_username: Optional[str] = None

    @staticmethod
    def resolve_reviewed_by_username(obj):
        return obj.reviewed_by.username if obj.reviewed_by else None

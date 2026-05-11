from datetime import datetime
from typing import List, Literal, Optional

from ninja import Schema
from pydantic import EmailStr, Field


# ── Auth schemas ──────────────────────────────────────────────


class SignupIn(Schema):
    username: str = Field(..., min_length=3, max_length=150)
    password: str = Field(..., min_length=8, max_length=128)
    email: EmailStr


class SignupOut(Schema):
    id: int
    username: str


class LoginIn(Schema):
    username: str = Field(..., max_length=150)
    password: str = Field(..., max_length=128)
    remember_me: bool = False


class AuthUserOut(Schema):
    id: int
    username: str
    email: str
    role: str
    email_verified: bool = False
    reputation_score: int = 0
    is_trusted: bool = False

    @staticmethod
    def resolve_role(obj):
        return obj.profile.role

    @staticmethod
    def resolve_email_verified(obj):
        try:
            return obj.profile.email_verified
        except Exception:
            return False

    @staticmethod
    def resolve_reputation_score(obj):
        try:
            return obj.profile.reputation_score
        except Exception:
            return 0

    @staticmethod
    def resolve_is_trusted(obj):
        from .models import HIGH_REPUTATION_THRESHOLD
        try:
            return obj.profile.reputation_score >= HIGH_REPUTATION_THRESHOLD
        except Exception:
            return False


class EmailVerifyIn(Schema):
    token: str


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
    title: str = Field(..., min_length=1, max_length=300)
    body: str = Field(..., min_length=1, max_length=50000)
    tags: List[str] = []
    is_question: bool = False
    has_spoilers: bool = False
    status: str = "published"  # "published" or "draft"


class PostUpdateIn(Schema):
    game_hub_id: Optional[int] = None
    title: Optional[str] = Field(None, max_length=300)
    body: Optional[str] = Field(None, max_length=50000)
    tags: Optional[List[str]] = None
    is_question: Optional[bool] = None
    has_spoilers: Optional[bool] = None
    status: Optional[str] = None


class PostAuthorOut(Schema):
    id: int
    username: str
    reputation_score: int = 0
    is_trusted: bool = False

    @staticmethod
    def resolve_reputation_score(obj):
        try:
            return obj.profile.reputation_score
        except Exception:
            return 0

    @staticmethod
    def resolve_is_trusted(obj):
        from .models import HIGH_REPUTATION_THRESHOLD
        try:
            return obj.profile.reputation_score >= HIGH_REPUTATION_THRESHOLD
        except Exception:
            return False


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
    is_priority: bool = False
    is_pinned: bool = False
    created_at: datetime
    updated_at: datetime
    vote_score: int
    upvote_count: int
    downvote_count: int
    current_user_vote: int = 0
    comment_count: int = 0
    weighted_score: float = 0.0

    @staticmethod
    def resolve_is_priority(obj):
        from .models import HIGH_REPUTATION_THRESHOLD
        try:
            return obj.author.profile.reputation_score >= HIGH_REPUTATION_THRESHOLD
        except Exception:
            return False


class SearchUserOut(Schema):
    id: int
    username: str
    reputation_score: int = 0
    is_trusted: bool = False

    @staticmethod
    def resolve_reputation_score(obj):
        try:
            return obj.profile.reputation_score
        except Exception:
            return 0

    @staticmethod
    def resolve_is_trusted(obj):
        from .models import HIGH_REPUTATION_THRESHOLD
        try:
            return obj.profile.reputation_score >= HIGH_REPUTATION_THRESHOLD
        except Exception:
            return False


class SearchOut(Schema):
    posts: List[PostOut]
    game_hubs: List[GameHubOut]
    tags: List[TagOut]
    users: List[SearchUserOut]


class PostVoteIn(Schema):
    value: Literal[-1, 0, 1]


class PostReportCreateIn(Schema):
    reason: str = Field(..., min_length=1, max_length=500)


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
    note: str = Field("", max_length=1000)


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
    report_status: str
    created_at: datetime
    updated_at: datetime
    report_count: int
    latest_report_reason: Optional[str] = None
    latest_reported_at: Optional[datetime] = None
    latest_action: Optional[str] = None
    latest_action_note: Optional[str] = None
    latest_action_at: Optional[datetime] = None


class NotificationOut(Schema):
    id: int
    type: str
    title: str
    message: str
    is_read: bool
    created_at: datetime
    actor_username: Optional[str] = None
    post_id: Optional[int] = None
    post_title: Optional[str] = None
    post_status: Optional[str] = None

    @staticmethod
    def resolve_actor_username(obj):
        return obj.actor.username if obj.actor else None

    @staticmethod
    def resolve_post_id(obj):
        return obj.post_id

    @staticmethod
    def resolve_post_title(obj):
        return obj.post.title if obj.post else None

    @staticmethod
    def resolve_post_status(obj):
        return obj.post.status if obj.post else None


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
    reason: str = Field("", max_length=1000)


class ModeratorRequestReviewIn(Schema):
    status: Literal["approved", "rejected"]
    review_note: str = Field("", max_length=1000)


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


# ── Developer Feedback schemas ─────────────────────────────────────────────────


class DeveloperFeedbackIn(Schema):
    message: str = Field(...)


class DeveloperFeedbackOut(Schema):
    id: int
    game_hub: GameHubOut
    from_username: str
    message: str
    created_at: datetime

    @staticmethod
    def resolve_from_username(obj):
        return obj.from_user.username if obj.from_user else "[deleted]"

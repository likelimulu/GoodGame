import logging
import os
import re
import secrets
from datetime import datetime as datetime_class, timedelta
from typing import List, Optional

from ninja import File, Form, Router
from ninja.files import UploadedFile
from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Case, CharField, Count, DateTimeField, FloatField, IntegerField, OuterRef, Q, Subquery, Sum, TextField, Value, When
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import get_valid_filename

logger = logging.getLogger("GoodGame")

from .models import (
    CommentModerationAction,
    CommentModerationReport,
    HIGH_REPUTATION_THRESHOLD,
    DeveloperFeedback,
    EmailVerificationToken,
    GameHub,
    ModeratorAccessRequest,
    Notification,
    Post,
    PostComment,
    PostModerationAction,
    PostModerationReport,
    PostVote,
    Tag,
    UserProfile,
)
from .schemas import (
    AuthUserOut,
    AvatarOut,
    CommentModerationReportOut,
    CommentReportCreateIn,
    DeveloperFeedbackIn,
    DeveloperFeedbackOut,
    EmailVerifyIn,
    ErrorOut,
    GameHubOut,
    LoginIn,
    MessageOut,
    ModeratorRequestCreateIn,
    ModeratorRequestOut,
    ModeratorRequestReviewIn,
    NotificationOut,
    PostIn,
    PostCommentOut,
    PostModerationActionIn,
    PostModerationReportOut,
    PostOut,
    PostReportCreateIn,
    PostVoteIn,
    PostVoteSummaryOut,
    PostUpdateIn,
    SearchOut,
    SignupIn,
    SignupOut,
    TagOut,
    ModerationQueueItemOut,
    UserRoleIn,
    UserRoleOut,
)

router = Router()

SEARCH_MIN_QUERY_LENGTH = 2
SEARCH_POST_LIMIT = 20
SEARCH_GROUP_LIMIT = 8


# ── Auth endpoints ────────────────────────────────────────────


def _send_verification_email(user):
    token = secrets.token_urlsafe(48)
    expiry_hours = getattr(settings, "EMAIL_VERIFICATION_EXPIRY_HOURS", 24)
    EmailVerificationToken.objects.create(
        user=user,
        token=token,
        expires_at=timezone.now() + timedelta(hours=expiry_hours),
    )
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
    verify_link = f"{frontend_url}/verify-email?token={token}"
    send_mail(
        subject="GoodGame — Verify your email address",
        message=(
            f"Hi {user.username},\n\n"
            f"Please verify your email by clicking the link below:\n\n"
            f"{verify_link}\n\n"
            f"This link expires in {expiry_hours} hours.\n\n"
            "— The GoodGame Team"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=True,
    )


@router.post("/signup", response={201: SignupOut, 400: ErrorOut, 409: ErrorOut})
def signup(request, data: SignupIn):
    if User.objects.filter(username=data.username).exists():
        logger.warning("Signup attempted with existing username '%s'", data.username)
        return 409, {"error": "Username already taken"}

    try:
        validate_password(data.password)
    except ValidationError as e:
        logger.warning("Signup password validation failed for username '%s'", data.username)
        return 400, {"error": "; ".join(e.messages)}

    user = User.objects.create_user(
        username=data.username,
        password=data.password,
        email=data.email,
    )
    logger.info("New user registered: '%s'", user.username)
    _send_verification_email(user)
    return 201, user


@router.post("/auth/login", response={200: AuthUserOut, 401: ErrorOut})
def login(request, data: LoginIn):
    user = authenticate(request, username=data.username, password=data.password)
    if user is None:
        logger.warning("Failed login attempt for username '%s' from %s", data.username, request.META.get("REMOTE_ADDR"))
        return 401, {"error": "Invalid username or password"}

    auth_login(request, user)
    logger.info("User '%s' logged in from %s", user.username, request.META.get("REMOTE_ADDR"))
    if data.remember_me:
        request.session.set_expiry(settings.PERSISTENT_LOGIN_AGE_SECONDS)
    else:
        request.session.set_expiry(0)
    return 200, user


@router.post("/auth/logout", response=MessageOut)
def logout(request):
    username = request.user.username if request.user.is_authenticated else "anonymous"
    auth_logout(request)
    logger.info("User '%s' logged out", username)
    return {"message": "Logged out"}


@router.get("/auth/me", response={200: AuthUserOut, 401: ErrorOut})
def me(request):
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}

    return 200, request.user


@router.post("/auth/verify-email", response={200: MessageOut, 400: ErrorOut, 409: ErrorOut})
def verify_email(request, data: EmailVerifyIn):
    """Verify a user's email address using the token from the verification email."""
    token_obj = EmailVerificationToken.objects.filter(token=data.token).select_related("user", "user__profile").first()
    if not token_obj:
        return 400, {"error": "Invalid verification token"}

    if token_obj.used_at is not None:
        return 409, {"error": "This token has already been used"}

    if timezone.now() > token_obj.expires_at:
        return 400, {"error": "Verification token has expired. Please request a new one."}

    token_obj.used_at = timezone.now()
    token_obj.save(update_fields=["used_at"])
    token_obj.user.profile.email_verified = True
    token_obj.user.profile.save(update_fields=["email_verified"])
    return 200, {"message": "Email verified successfully"}


@router.post("/auth/resend-verification", response={200: MessageOut, 401: ErrorOut, 409: ErrorOut})
def resend_verification(request):
    """Resend the verification email to the current authenticated user."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}

    if request.user.profile.email_verified:
        return 409, {"error": "Email is already verified"}

    _send_verification_email(request.user)
    return 200, {"message": "Verification email sent"}


# ── Notification endpoints ────────────────────────────────────


@router.get("/notifications", response={200: List[NotificationOut], 401: ErrorOut})
def list_notifications(request):
    """List in-app notifications for the current authenticated user."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}

    return 200, _notifications_for_user(request.user)


@router.post(
    "/notifications/{notification_id}/read",
    response={200: NotificationOut, 401: ErrorOut, 404: ErrorOut},
)
def mark_notification_read(request, notification_id: int):
    """Mark one of the current user's notifications as read."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}

    notification = _notifications_for_user(request.user).filter(id=notification_id).first()
    if notification is None:
        return 404, {"error": "Notification not found"}
    if not notification.is_read:
        notification.is_read = True
        notification.save(update_fields=["is_read"])
    return 200, notification


# ── User profile endpoints ─────────────────────────────────────


@router.put("/users/{user_id}/role", response={200: UserRoleOut, 401: ErrorOut, 403: ErrorOut, 404: ErrorOut})
def update_user_role(request, user_id: int, data: UserRoleIn):
    """Change a user's role. Admin access required."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}
    if request.user.profile.role != UserProfile.Role.ADMIN:
        return 403, {"error": "Admin access required"}

    user = get_object_or_404(User, id=user_id)
    user.profile.role = data.role
    user.profile.save()
    return 200, {"id": user.id, "username": user.username, "role": user.profile.role}


@router.post("/users/me/moderator-request", response={201: ModeratorRequestOut, 401: ErrorOut, 409: ErrorOut})
def create_moderator_request(request, data: ModeratorRequestCreateIn):
    """Create a moderator access request for the current user."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}

    if request.user.profile.role in (UserProfile.Role.ADMIN, UserProfile.Role.MODERATOR):
        return 409, {"error": "User already has moderation access"}

    if ModeratorAccessRequest.objects.filter(user=request.user).exists():
        moderator_request = request.user.moderator_access_request
        if moderator_request.status == ModeratorAccessRequest.Status.PENDING:
            return 409, {"error": "Moderator request already pending"}
        return 409, {"error": "Moderator request has already been reviewed"}

    moderator_request = ModeratorAccessRequest.objects.create(
        user=request.user,
        reason=data.reason.strip(),
    )
    return 201, moderator_request


@router.get("/moderator-requests", response={200: List[ModeratorRequestOut], 401: ErrorOut, 403: ErrorOut})
def list_moderator_requests(request, status: str = None):
    """List moderator access requests. Admin access required."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}
    if request.user.profile.role != UserProfile.Role.ADMIN:
        return 403, {"error": "Admin access required"}

    requests = ModeratorAccessRequest.objects.select_related("user", "reviewed_by", "user__profile")
    if status in {
        ModeratorAccessRequest.Status.PENDING,
        ModeratorAccessRequest.Status.APPROVED,
        ModeratorAccessRequest.Status.REJECTED,
    }:
        requests = requests.filter(status=status)
    return 200, requests


@router.put(
    "/moderator-requests/{request_id}",
    response={200: ModeratorRequestOut, 401: ErrorOut, 403: ErrorOut, 404: ErrorOut, 409: ErrorOut},
)
def review_moderator_request(request, request_id: int, data: ModeratorRequestReviewIn):
    """Approve or reject a moderator access request. Admin access required."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}
    if request.user.profile.role != UserProfile.Role.ADMIN:
        return 403, {"error": "Admin access required"}

    moderator_request = get_object_or_404(
        ModeratorAccessRequest.objects.select_related("user", "user__profile"),
        id=request_id,
    )
    if moderator_request.status != ModeratorAccessRequest.Status.PENDING:
        return 409, {"error": "Moderator request already reviewed"}

    moderator_request.status = data.status
    moderator_request.review_note = data.review_note.strip()
    moderator_request.reviewed_by = request.user
    moderator_request.reviewed_at = timezone.now()
    moderator_request.save()

    if data.status == ModeratorAccessRequest.Status.APPROVED:
        moderator_request.user.profile.role = UserProfile.Role.MODERATOR
        moderator_request.user.profile.save()

    return 200, moderator_request


_ALLOWED_ATTACHMENT_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif"}
_MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024   # 5 MB
_MAX_AVATAR_SIZE = 2 * 1024 * 1024       # 2 MB


def _validate_upload(file: UploadedFile, max_size: int, allowed_extensions: set = None):
    """Validate user uploads before handing them to local/Azure storage."""
    if file.size > max_size:
        msg = f"File size exceeds {max_size // (1024 * 1024)} MB limit"
        logger.warning("Upload rejected — %s (filename: '%s', size: %d)", msg, file.name, file.size)
        return msg
    if allowed_extensions is not None:
        ext = os.path.splitext(file.name)[1].lower()
        if ext not in allowed_extensions:
            msg = f"File type '{ext}' is not allowed"
            logger.warning("Upload rejected — %s (filename: '%s')", msg, file.name)
            return msg
    return None


@router.put("/users/me/avatar", response={200: AvatarOut, 400: ErrorOut, 401: ErrorOut})
def update_avatar(request, file: UploadedFile = File(...)):
    """Upload a new profile picture. Saves to Azure Blob Storage (or local media in dev)."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}

    error = _validate_upload(file, _MAX_AVATAR_SIZE)
    if error:
        return 400, {"error": error}

    profile = request.user.profile
    safe_name = get_valid_filename(file.name)
    profile.profile_picture.save(safe_name, file, save=True)
    return 200, {"url": profile.profile_picture.url}


# ── GameHub endpoints ─────────────────────────────────────────


@router.get("/gamehubs", response=List[GameHubOut])
def list_gamehubs(request):
    """Return all available game hubs (for the forum dropdown)."""
    return GameHub.objects.all()


@router.get("/tags", response=List[TagOut])
def list_tags(request):
    """Return all existing tags (for the filter dropdown)."""
    return Tag.objects.order_by("name")


_TAG_KEYWORDS: dict[str, set[str]] = {
    "nerf":        {"nerfed", "sucks", "suck", "useless", "terrible", "trash", "weak",
                    "destroyed", "worse", "bad", "ruined", "garbage", "unplayable", "worst"},
    "buff":        {"buffed", "op", "overpowered", "strong", "powerful", "buffing", "broken"},
    "bug":         {"crash", "freeze", "issue", "broken", "error", "fix", "glitching"},
    "glitch":      {"crash", "freeze", "bugged", "broken", "glitching"},
    "rant":        {"suck", "sucks", "hate", "awful", "terrible", "worst", "angry", "mad",
                    "devs", "stupid", "ridiculous"},
    "update":      {"patched", "hotfix", "patch"},
    "patch":       {"updated", "hotfix", "patchnotes"},
    "meta":        {"tier", "strongest", "best", "competitive"},
    "guide":       {"tutorial", "walkthrough", "howto"},
    "beginner":    {"noob", "newbie", "learning", "starting"},
    "advanced":    {"expert", "tryhard", "skilled", "pro"},
    "discussion":  {"thoughts", "opinion", "debate", "think"},
    "competitive": {"tournament", "esport", "ladder", "ranked"},
    "feedback":    {"suggestion", "suggest", "improve", "improvement"},
    "highlight":   {"clip", "montage", "plays", "play"},
}


def _score_tag(tag_name: str, words: set[str]) -> int:
    """Rank an existing tag against draft text without creating new tags."""
    name = tag_name.lower()
    score = 0
    for word in words:
        if name in word or (len(word) >= 4 and word in name):
            score += 3
    score += len(words & _TAG_KEYWORDS.get(name, set()))
    return score


@router.get("/tags/suggest", response=List[TagOut])
def suggest_tags(request, title: str = "", body: str = ""):
    """Suggest existing tags relevant to the given post title and body."""
    MAX_SUGGESTIONS = 5
    combined = f"{title} {body}".lower()
    words = set(re.findall(r"[a-z0-9]+", combined))

    if not words:
        return []

    scored = [
        (tag, _score_tag(tag.name, words))
        for tag in Tag.objects.order_by("name")
    ]
    scored = [(tag, s) for tag, s in scored if s > 0]
    scored.sort(key=lambda x: x[1], reverse=True)
    return [tag for tag, _ in scored[:MAX_SUGGESTIONS]]


# ── Search endpoint ───────────────────────────────────────────


@router.get("/search", response=SearchOut)
def search(request, q: str = ""):
    """Search public content without including comments."""
    query = q.strip()
    empty_results = {
        "posts": [],
        "game_hubs": [],
        "tags": [],
        "users": [],
    }
    if len(query) < SEARCH_MIN_QUERY_LENGTH:
        return empty_results

    game_hubs = GameHub.objects.filter(
        Q(name__icontains=query) | Q(slug__icontains=query)
    ).order_by("name")[:SEARCH_GROUP_LIMIT]
    tags = Tag.objects.filter(name__icontains=query).order_by("name")[:SEARCH_GROUP_LIMIT]
    users = (
        User.objects.filter(
            username__icontains=query,
            posts__status=Post.Status.PUBLISHED,
        )
        .select_related("profile")
        .distinct()
        .order_by("username")[:SEARCH_GROUP_LIMIT]
    )
    posts = (
        _annotate_post_stats(_posts_with_related_data())
        .filter(status=Post.Status.PUBLISHED)
        .filter(
            Q(title__icontains=query)
            | Q(body__icontains=query)
            | Q(game_hub__name__icontains=query)
            | Q(game_hub__slug__icontains=query)
            | Q(tags__name__icontains=query)
            | Q(author__username__icontains=query)
        )
        .distinct()
        .order_by("-weighted_score", "-created_at")[:SEARCH_POST_LIMIT]
    )

    return {
        "posts": _attach_current_user_vote(posts, request.user),
        "game_hubs": list(game_hubs),
        "tags": list(tags),
        "users": list(users),
    }


# ── Post endpoints ────────────────────────────────────────────


def _get_or_create_tags(tag_names: List[str]) -> List[Tag]:
    """Get existing tags or create new ones; returns a list of Tag instances."""
    tags = []
    for name in tag_names[:5]:  # max 5 tags
        cleaned = name.strip()[:40]
        if not cleaned:
            continue
        tag, _ = Tag.objects.get_or_create(name=cleaned)
        tags.append(tag)
    return tags


def _posts_with_related_data():
    return Post.objects.select_related("game_hub", "author", "author__profile").prefetch_related("tags")


def _comments_with_related_data():
    return PostComment.objects.select_related(
        "post",
        "post__game_hub",
        "post__author",
        "post__author__profile",
        "author",
        "author__profile",
    ).prefetch_related("post__tags")


def _annotate_post_stats(queryset):
    """Attach vote/comment aggregates plus the feed ranking score.

    Weighted score intentionally boosts trusted author posts and trusted-user
    votes while preserving the raw vote totals for display.
    """
    vote_totals = PostVote.objects.filter(post_id=OuterRef("pk")).order_by().values("post")
    comment_totals = (
        PostComment.objects.filter(
            post_id=OuterRef("pk"),
            status=PostComment.Status.PUBLISHED,
        ).order_by().values("post")
    )

    trusted_upvotes = (
        PostVote.objects.filter(
            post_id=OuterRef("pk"),
            value=PostVote.Value.UPVOTE,
            user__profile__reputation_score__gte=HIGH_REPUTATION_THRESHOLD,
        )
        .order_by()
        .values("post")
        .annotate(total=Count("id"))
        .values("total")[:1]
    )
    trusted_downvotes = (
        PostVote.objects.filter(
            post_id=OuterRef("pk"),
            value=PostVote.Value.DOWNVOTE,
            user__profile__reputation_score__gte=HIGH_REPUTATION_THRESHOLD,
        )
        .order_by()
        .values("post")
        .annotate(total=Count("id"))
        .values("total")[:1]
    )

    author_bonus = Case(
        When(author__profile__reputation_score__gte=HIGH_REPUTATION_THRESHOLD, then=Value(3.0)),
        default=Value(0.0),
        output_field=FloatField(),
    )

    return queryset.annotate(
        vote_score=Coalesce(
            Subquery(
                vote_totals.annotate(total=Sum("value")).values("total")[:1],
                output_field=IntegerField(),
            ),
            Value(0),
        ),
        upvote_count=Coalesce(
            Subquery(
                vote_totals.annotate(
                    total=Count("id", filter=Q(value=PostVote.Value.UPVOTE))
                ).values("total")[:1],
                output_field=IntegerField(),
            ),
            Value(0),
        ),
        downvote_count=Coalesce(
            Subquery(
                vote_totals.annotate(
                    total=Count("id", filter=Q(value=PostVote.Value.DOWNVOTE))
                ).values("total")[:1],
                output_field=IntegerField(),
            ),
            Value(0),
        ),
        comment_count=Coalesce(
            Subquery(
                comment_totals.annotate(total=Count("id")).values("total")[:1],
                output_field=IntegerField(),
            ),
            Value(0),
        ),
        weighted_score=Coalesce(
            Subquery(
                vote_totals.annotate(total=Sum("value")).values("total")[:1],
                output_field=FloatField(),
            ),
            Value(0.0),
            output_field=FloatField(),
        ) + Coalesce(Subquery(trusted_upvotes, output_field=FloatField()), Value(0.0))
          - Coalesce(Subquery(trusted_downvotes, output_field=FloatField()), Value(0.0))
          + author_bonus,
    )


def _attach_current_user_vote(posts, user):
    """Attach the signed-in user's vote to each post without changing public counts."""
    posts = list(posts)
    vote_map = {}
    if user.is_authenticated and posts:
        vote_map = dict(
            PostVote.objects.filter(user=user, post_id__in=[post.id for post in posts])
            .values_list("post_id", "value")
        )

    for post in posts:
        post.current_user_vote = vote_map.get(post.id, 0)
    return posts


def _get_post_with_stats(post_id: int, user):
    post = get_object_or_404(_annotate_post_stats(_posts_with_related_data()), id=post_id)
    _attach_current_user_vote([post], user)
    return post


def _absolute_file_url(request, field_file):
    """Return a browser-ready file URL for either local media or Azure blobs."""
    if not field_file:
        return None

    file_url = field_file.url
    if file_url.startswith("http://") or file_url.startswith("https://"):
        return file_url
    # Local storage: return the relative path so the browser resolves it
    # against the page origin. The Vite dev proxy forwards /media/* to the
    # backend container, avoiding the unresolvable internal hostname
    # (api:8000) that request.build_absolute_uri() would produce in Docker.
    return file_url


def _attach_comment_file_fields(comments, request):
    """Hydrate transient attachment fields expected by PostCommentOut."""
    comments = list(comments)
    for comment in comments:
        comment.attachment_name = (
            comment.attachment_original_name
            or comment.attachment.name.rsplit("/", 1)[-1]
            if comment.attachment
            else None
        )
        comment.attachment_url = _absolute_file_url(request, comment.attachment)
    return comments


def _has_moderation_access(user):
    """Admins and moderators share access to the moderation queue/actions."""
    return user.is_authenticated and user.profile.role in {
        UserProfile.Role.ADMIN,
        UserProfile.Role.MODERATOR,
    }


def _create_moderation_notification(content, moderator, action_record, note: str):
    """Notify authors only for moderation actions that directly affect them."""
    is_comment = isinstance(content, PostComment)
    if action_record.action in {
        PostModerationAction.Action.WARN,
        CommentModerationAction.Action.WARN,
    }:
        notification_type = (
            Notification.Type.COMMENT_WARNING
            if is_comment
            else Notification.Type.MODERATION_WARNING
        )
        title = "Moderator warning"
        if is_comment:
            message = f'Your comment on "{content.post.title}" received a moderator warning.'
        else:
            message = f'Your post "{content.title}" received a moderator warning.'
    elif action_record.action in {
        PostModerationAction.Action.REMOVE,
        CommentModerationAction.Action.REMOVE,
    }:
        notification_type = (
            Notification.Type.COMMENT_REMOVED
            if is_comment
            else Notification.Type.POST_REMOVED
        )
        if is_comment:
            title = "Comment removed"
            message = f'Your comment on "{content.post.title}" was removed from GoodGame.'
        else:
            title = "Post removed"
            message = f'Your post "{content.title}" was removed from GoodGame.'
    else:
        return None

    if note:
        message = f"{message}\n\nModerator note: {note}"

    lookup = (
        {"comment_moderation_action": action_record}
        if is_comment
        else {"moderation_action": action_record}
    )
    notification, _ = Notification.objects.get_or_create(
        **lookup,
        defaults={
            "recipient": content.author,
            "actor": moderator,
            "post": content.post if is_comment else content,
            "comment": content if is_comment else None,
            "type": notification_type,
            "title": title,
            "message": message,
        },
    )
    return notification


def _annotate_post_moderation_queue(queryset):
    """Attach latest report/action metadata used by the unified moderation queue."""
    reports = PostModerationReport.objects.filter(post_id=OuterRef("pk"))
    actions = PostModerationAction.objects.filter(post_id=OuterRef("pk")).order_by("-created_at")
    latest_reports = reports.order_by("-created_at")

    return queryset.annotate(
        report_count=Coalesce(
            Subquery(
                reports.order_by().values("post").annotate(total=Count("id")).values("total")[:1],
                output_field=IntegerField(),
            ),
            Value(0),
        ),
        report_status=Subquery(
            latest_reports.values("status")[:1],
            output_field=CharField(),
        ),
        latest_report_reason=Subquery(
            latest_reports.values("reason")[:1],
            output_field=TextField(),
        ),
        latest_reported_at=Subquery(
            latest_reports.values("created_at")[:1],
            output_field=DateTimeField(),
        ),
        latest_action=Subquery(
            actions.values("action")[:1],
            output_field=CharField(),
        ),
        latest_action_note=Subquery(
            actions.values("note")[:1],
            output_field=TextField(),
        ),
        latest_action_at=Subquery(
            actions.values("created_at")[:1],
            output_field=DateTimeField(),
        ),
    )


def _annotate_comment_moderation_queue(queryset):
    """Attach latest report/action metadata for reported comments."""
    reports = CommentModerationReport.objects.filter(comment_id=OuterRef("pk"))
    actions = CommentModerationAction.objects.filter(comment_id=OuterRef("pk")).order_by("-created_at")
    latest_reports = reports.order_by("-created_at")

    return queryset.annotate(
        report_count=Coalesce(
            Subquery(
                reports.order_by().values("comment").annotate(total=Count("id")).values("total")[:1],
                output_field=IntegerField(),
            ),
            Value(0),
        ),
        report_status=Subquery(
            latest_reports.values("status")[:1],
            output_field=CharField(),
        ),
        latest_report_reason=Subquery(
            latest_reports.values("reason")[:1],
            output_field=TextField(),
        ),
        latest_reported_at=Subquery(
            latest_reports.values("created_at")[:1],
            output_field=DateTimeField(),
        ),
        latest_action=Subquery(
            actions.values("action")[:1],
            output_field=CharField(),
        ),
        latest_action_note=Subquery(
            actions.values("note")[:1],
            output_field=TextField(),
        ),
        latest_action_at=Subquery(
            actions.values("created_at")[:1],
            output_field=DateTimeField(),
        ),
    )


def _get_moderation_queue_item(post_id: int):
    return get_object_or_404(
        _annotate_post_moderation_queue(_posts_with_related_data()),
        id=post_id,
    )


def _get_comment_moderation_queue_item(comment_id: int):
    return get_object_or_404(
        _annotate_comment_moderation_queue(_comments_with_related_data()),
        id=comment_id,
    )


def _notifications_for_user(user):
    return Notification.objects.filter(recipient=user).select_related("actor", "post", "comment")


def _serialize_post_queue_item(post):
    """Normalize post reports to the shared moderation queue response shape."""
    return {
        "id": post.id,
        "target_type": "post",
        "game_hub": post.game_hub,
        "author": post.author,
        "title": post.title,
        "body": post.body,
        "tags": list(post.tags.all()),
        "is_question": post.is_question,
        "has_spoilers": post.has_spoilers,
        "status": post.status,
        "created_at": post.created_at,
        "updated_at": post.updated_at,
        "report_status": post.report_status,
        "report_count": post.report_count,
        "latest_report_reason": post.latest_report_reason,
        "latest_reported_at": post.latest_reported_at,
        "latest_action": post.latest_action,
        "latest_action_note": post.latest_action_note,
        "latest_action_at": post.latest_action_at,
        "parent_post_id": None,
        "parent_post_title": None,
        "attachment_name": None,
        "attachment_url": None,
    }


def _serialize_comment_queue_item(comment, request):
    """Normalize comment reports to the shared moderation queue response shape."""
    return {
        "id": comment.id,
        "target_type": "comment",
        "game_hub": comment.post.game_hub,
        "author": comment.author,
        "title": f'Comment on "{comment.post.title}"',
        "body": comment.body,
        "tags": list(comment.post.tags.all()),
        "is_question": comment.post.is_question,
        "has_spoilers": comment.post.has_spoilers,
        "status": comment.status,
        "created_at": comment.created_at,
        "updated_at": comment.updated_at,
        "report_status": comment.report_status,
        "report_count": comment.report_count,
        "latest_report_reason": comment.latest_report_reason,
        "latest_reported_at": comment.latest_reported_at,
        "latest_action": comment.latest_action,
        "latest_action_note": comment.latest_action_note,
        "latest_action_at": comment.latest_action_at,
        "parent_post_id": comment.post_id,
        "parent_post_title": comment.post.title,
        "attachment_name": comment.attachment_original_name or None,
        "attachment_url": _absolute_file_url(request, comment.attachment),
    }


@router.post("/posts", response={201: PostOut, 401: ErrorOut, 403: ErrorOut, 404: ErrorOut})
def create_post(request, data: PostIn):
    """Create a post; developer posts are restricted to and pinned in assigned hubs."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}

    game_hub = get_object_or_404(GameHub, id=data.game_hub_id)

    is_developer = _is_developer(request.user)
    if is_developer and not request.user.developed_hubs.filter(id=game_hub.id).exists():
        return 403, {"error": "Developers can only post in their assigned hubs"}

    auto_pin = is_developer

    post = Post.objects.create(
        game_hub=game_hub,
        author=request.user,
        title=data.title,
        body=data.body,
        is_question=data.is_question,
        has_spoilers=data.has_spoilers,
        is_pinned=auto_pin,
        status=data.status if data.status in ("published", "draft") else "published",
    )

    if data.tags:
        post.tags.set(_get_or_create_tags(data.tags))

    return 201, _get_post_with_stats(post.id, request.user)


def _is_trusted_user(user) -> bool:
    """Trusted users unlock advanced feed controls without adding a new role."""
    if not user.is_authenticated:
        return False
    try:
        return user.profile.reputation_score >= HIGH_REPUTATION_THRESHOLD
    except UserProfile.DoesNotExist:
        return False


ADVANCED_SORT_OPTIONS = {
    # Public feed ordering always keeps pinned posts first. Only trusted users
    # may select these sort modes; everyone else gets weighted ranking.
    "votes": ["-is_pinned", "-vote_score", "-created_at"],
    "weighted": ["-is_pinned", "-weighted_score", "-created_at"],
    "newest": ["-is_pinned", "-created_at"],
    "oldest": ["-is_pinned", "created_at"],
    "most_commented": ["-is_pinned", "-comment_count", "-created_at"],
    "controversial": ["-is_pinned", "-downvote_count", "-upvote_count", "-created_at"],
}


@router.get("/posts", response={200: List[PostOut], 401: ErrorOut})
def list_posts(
    request,
    game_hub_id: int = None,
    status: str = "published",
    mine: bool = False,
    sort_by: str = None,
    tag: str = None,
    author: str = None,
    date_from: str = None,
    date_to: str = None,
):
    """List public posts or the authenticated user's own posts.

    Trusted users (high reputation) unlock advanced sort/filter parameters;
    untrusted requests silently fall back to the default ranked public feed.
    """
    qs = _annotate_post_stats(_posts_with_related_data())

    if mine:
        if not request.user.is_authenticated:
            return 401, {"error": "Authentication required"}
        qs = qs.filter(author=request.user).exclude(status=Post.Status.DELETED).order_by("-updated_at")
    else:
        qs = qs.filter(status=Post.Status.PUBLISHED)

        trusted = _is_trusted_user(request.user)

        if trusted and sort_by and sort_by in ADVANCED_SORT_OPTIONS:
            qs = qs.order_by(*ADVANCED_SORT_OPTIONS[sort_by])
        else:
            qs = qs.order_by("-is_pinned", "-weighted_score", "-created_at")

        if trusted and tag:
            qs = qs.filter(tags__name__iexact=tag)
        if trusted and author:
            qs = qs.filter(author__username__icontains=author)
        if trusted and date_from:
            parsed = _parse_iso_date(date_from)
            if parsed:
                qs = qs.filter(created_at__date__gte=parsed)
        if trusted and date_to:
            parsed = _parse_iso_date(date_to)
            if parsed:
                qs = qs.filter(created_at__date__lte=parsed)

    if game_hub_id:
        qs = qs.filter(game_hub_id=game_hub_id)
    return 200, _attach_current_user_vote(qs.distinct(), request.user)


@router.get("/posts/{post_id}", response={200: PostOut, 404: ErrorOut})
def get_post(request, post_id: int):
    """Retrieve a single post by id."""
    qs = _annotate_post_stats(
        _posts_with_related_data().exclude(status=Post.Status.DELETED)
    )
    post = get_object_or_404(qs, id=post_id)
    _attach_current_user_vote([post], request.user)
    return 200, post


@router.put("/posts/{post_id}", response={200: PostOut, 401: ErrorOut, 403: ErrorOut, 404: ErrorOut})
def update_post(request, post_id: int, data: PostUpdateIn):
    """Update an existing post (only the author may edit)."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}

    post = get_object_or_404(Post, id=post_id)

    if post.author_id != request.user.id:
        return 403, {"error": "You can only edit your own posts"}

    if data.game_hub_id is not None:
        new_hub = get_object_or_404(GameHub, id=data.game_hub_id)
        if _is_developer(request.user) and not request.user.developed_hubs.filter(id=new_hub.id).exists():
            return 403, {"error": "Developers can only post in their assigned hubs"}
        post.game_hub = new_hub
    if data.title is not None:
        post.title = data.title
    if data.body is not None:
        post.body = data.body
    if data.is_question is not None:
        post.is_question = data.is_question
    if data.has_spoilers is not None:
        post.has_spoilers = data.has_spoilers
    if data.status is not None and data.status in ("published", "draft"):
        post.status = data.status

    post.is_edited = True
    post.save()

    if data.tags is not None:
        post.tags.set(_get_or_create_tags(data.tags))

    return 200, _get_post_with_stats(post.id, request.user)


@router.delete("/posts/{post_id}", response={200: MessageOut, 401: ErrorOut, 403: ErrorOut, 404: ErrorOut})
def delete_post(request, post_id: int):
    """Soft-delete a post (only the author may delete)."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}

    post = get_object_or_404(Post, id=post_id)

    if post.author_id != request.user.id:
        return 403, {"error": "You can only delete your own posts"}

    post.status = Post.Status.DELETED
    post.save()
    return 200, {"message": "Post deleted"}


@router.put("/posts/{post_id}/pin", response={200: PostOut, 401: ErrorOut, 403: ErrorOut, 404: ErrorOut})
def toggle_pin_post(request, post_id: int):
    """Pin or unpin a post. Only the developer assigned to the post's hub can toggle."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}

    post = get_object_or_404(Post, id=post_id)

    if not _is_developer(request.user):
        return 403, {"error": "Only developers can pin posts"}
    if not request.user.developed_hubs.filter(id=post.game_hub_id).exists():
        return 403, {"error": "You can only pin posts in your assigned hubs"}

    post.is_pinned = not post.is_pinned
    post.save(update_fields=["is_pinned", "updated_at"])
    return 200, _get_post_with_stats(post.id, request.user)


@router.put(
    "/posts/{post_id}/vote",
    response={200: PostVoteSummaryOut, 401: ErrorOut, 404: ErrorOut},
)
def vote_on_post(request, post_id: int, data: PostVoteIn):
    """Apply or clear a user's vote on a published post."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}

    post = get_object_or_404(Post, id=post_id, status=Post.Status.PUBLISHED)

    if data.value == 0:
        PostVote.objects.filter(post=post, user=request.user).delete()
    else:
        PostVote.objects.update_or_create(
            post=post,
            user=request.user,
            defaults={"value": data.value},
        )

    return 200, _get_post_with_stats(post.id, request.user)


@router.get("/posts/{post_id}/comments", response={200: List[PostCommentOut], 404: ErrorOut})
def list_post_comments(request, post_id: int):
    """List comments for a published post."""
    post = get_object_or_404(Post, id=post_id, status=Post.Status.PUBLISHED)
    comments = (
        PostComment.objects.filter(
            post=post,
            status=PostComment.Status.PUBLISHED,
        ).select_related("author")
    )
    return 200, _attach_comment_file_fields(comments, request)


@router.post(
    "/posts/{post_id}/comments",
    response={201: PostCommentOut, 400: ErrorOut, 401: ErrorOut, 404: ErrorOut},
)
def create_post_comment(
    request,
    post_id: int,
    body: str = Form(...),
    attachment: UploadedFile = File(None),
):
    """Add a comment to a published post, with an optional file attachment."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}

    post = get_object_or_404(Post, id=post_id, status=Post.Status.PUBLISHED)
    cleaned_body = body.strip()
    if not cleaned_body:
        return 400, {"error": "Comment text is required"}

    comment = PostComment.objects.create(
        post=post,
        author=request.user,
        body=cleaned_body,
    )
    if attachment:
        error = _validate_upload(attachment, _MAX_ATTACHMENT_SIZE, _ALLOWED_ATTACHMENT_EXTENSIONS)
        if error:
            comment.delete()
            return 400, {"error": error}
        safe_name = get_valid_filename(attachment.name)
        comment.attachment_original_name = safe_name
        comment.attachment.save(safe_name, attachment, save=True)

    _attach_comment_file_fields([comment], request)
    return 201, comment


@router.post(
    "/comments/{comment_id}/reports",
    response={201: CommentModerationReportOut, 400: ErrorOut, 401: ErrorOut, 404: ErrorOut, 409: ErrorOut},
)
def create_comment_report(request, comment_id: int, data: CommentReportCreateIn):
    """Flag a published comment for moderator review."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}

    comment = get_object_or_404(
        PostComment.objects.select_related("post", "author"),
        id=comment_id,
        status=PostComment.Status.PUBLISHED,
        post__status=Post.Status.PUBLISHED,
    )
    if comment.author_id == request.user.id:
        return 409, {"error": "You cannot report your own comment"}

    reason = data.reason.strip()
    if not reason:
        return 400, {"error": "Report reason is required"}

    if CommentModerationReport.objects.filter(
        comment=comment,
        reporter=request.user,
        status__in=[CommentModerationReport.Status.OPEN, CommentModerationReport.Status.ESCALATED],
    ).exists():
        return 409, {"error": "You already have an active report for this comment"}

    report = CommentModerationReport.objects.create(
        comment=comment,
        reporter=request.user,
        reason=reason,
    )
    return 201, report


@router.post(
    "/posts/{post_id}/reports",
    response={201: PostModerationReportOut, 400: ErrorOut, 401: ErrorOut, 404: ErrorOut, 409: ErrorOut},
)
def create_post_report(request, post_id: int, data: PostReportCreateIn):
    """Flag a published post for moderator review."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}

    post = get_object_or_404(Post, id=post_id, status=Post.Status.PUBLISHED)
    if post.author_id == request.user.id:
        return 409, {"error": "You cannot report your own post"}

    reason = data.reason.strip()
    if not reason:
        return 400, {"error": "Report reason is required"}

    if PostModerationReport.objects.filter(
        post=post,
        reporter=request.user,
        status__in=[PostModerationReport.Status.OPEN, PostModerationReport.Status.ESCALATED],
    ).exists():
        return 409, {"error": "You already have an active report for this post"}

    report = PostModerationReport.objects.create(
        post=post,
        reporter=request.user,
        reason=reason,
    )
    return 201, report


@router.get(
    "/moderation/queue",
    response={200: List[ModerationQueueItemOut], 401: ErrorOut, 403: ErrorOut},
)
def list_moderation_queue(request, status: str = PostModerationReport.Status.OPEN):
    """List posts with moderation reports for moderators and admins."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}
    if not _has_moderation_access(request.user):
        return 403, {"error": "Moderator access required"}

    allowed_statuses = {
        PostModerationReport.Status.OPEN,
        PostModerationReport.Status.ESCALATED,
        PostModerationReport.Status.ACTIONED,
        PostModerationReport.Status.DISMISSED,
        "all",
    }
    selected_status = status if status in allowed_statuses else PostModerationReport.Status.OPEN

    post_queue = (
        _annotate_post_moderation_queue(_posts_with_related_data())
        .filter(report_count__gt=0)
        .exclude(status=Post.Status.DRAFT)
    )
    if selected_status != "all":
        post_queue = post_queue.filter(report_status=selected_status)

    comment_queue = (
        _annotate_comment_moderation_queue(_comments_with_related_data())
        .filter(report_count__gt=0)
        .exclude(post__status=Post.Status.DRAFT)
    )
    if selected_status != "all":
        comment_queue = comment_queue.filter(report_status=selected_status)

    items = [
        *[_serialize_post_queue_item(post) for post in post_queue],
        *[_serialize_comment_queue_item(comment, request) for comment in comment_queue],
    ]
    items.sort(
        key=lambda item: (
            item["latest_reported_at"] or item["updated_at"],
            item["report_count"],
            item["updated_at"],
        ),
        reverse=True,
    )
    return 200, items


@router.post(
    "/moderation/posts/{post_id}/actions",
    response={200: ModerationQueueItemOut, 400: ErrorOut, 401: ErrorOut, 403: ErrorOut, 404: ErrorOut, 409: ErrorOut},
)
def moderate_post(request, post_id: int, data: PostModerationActionIn):
    """Apply a moderator action to a reported post."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}
    if not _has_moderation_access(request.user):
        return 403, {"error": "Moderator access required"}

    note = data.note.strip()

    with transaction.atomic():
        post = get_object_or_404(Post.objects.select_for_update(), id=post_id)
        if post.status == Post.Status.DRAFT:
            return 404, {"error": "Post not found"}

        active_reports = PostModerationReport.objects.select_for_update().filter(
            post=post,
            status__in=[PostModerationReport.Status.OPEN, PostModerationReport.Status.ESCALATED],
        )
        if not active_reports.exists():
            return 409, {"error": "No active moderation reports for this post"}

        if data.action == PostModerationAction.Action.REMOVE and post.status == Post.Status.DELETED:
            return 409, {"error": "Post already removed"}

        action_record = PostModerationAction.objects.create(
            post=post,
            moderator=request.user,
            action=data.action,
            note=note,
        )
        logger.info(
            "Moderator '%s' applied action '%s' to post %d (author: '%s')",
            request.user.username, data.action, post.id, post.author.username,
        )

        now = timezone.now()
        if data.action == PostModerationAction.Action.ESCALATE:
            active_reports.update(
                status=PostModerationReport.Status.ESCALATED,
                reviewed_by=request.user,
                reviewed_at=now,
                updated_at=now,
            )
        elif data.action == PostModerationAction.Action.DISMISS:
            active_reports.update(
                status=PostModerationReport.Status.DISMISSED,
                reviewed_by=request.user,
                reviewed_at=now,
                updated_at=now,
            )
        else:
            active_reports.update(
                status=PostModerationReport.Status.ACTIONED,
                reviewed_by=request.user,
                reviewed_at=now,
                updated_at=now,
            )
            if data.action == PostModerationAction.Action.REMOVE:
                post.status = Post.Status.DELETED
                post.save(update_fields=["status", "updated_at"])
            _create_moderation_notification(post, request.user, action_record, note)

    return 200, _serialize_post_queue_item(_get_moderation_queue_item(post.id))


@router.post(
    "/moderation/comments/{comment_id}/actions",
    response={200: ModerationQueueItemOut, 400: ErrorOut, 401: ErrorOut, 403: ErrorOut, 404: ErrorOut, 409: ErrorOut},
)
def moderate_comment(request, comment_id: int, data: PostModerationActionIn):
    """Apply a moderator action to a reported comment."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}
    if not _has_moderation_access(request.user):
        return 403, {"error": "Moderator access required"}

    note = data.note.strip()

    with transaction.atomic():
        comment = get_object_or_404(
            PostComment.objects.select_related("post", "author").select_for_update(),
            id=comment_id,
        )
        if comment.post.status == Post.Status.DRAFT:
            return 404, {"error": "Comment not found"}

        active_reports = CommentModerationReport.objects.select_for_update().filter(
            comment=comment,
            status__in=[CommentModerationReport.Status.OPEN, CommentModerationReport.Status.ESCALATED],
        )
        if not active_reports.exists():
            return 409, {"error": "No active moderation reports for this comment"}

        if data.action == CommentModerationAction.Action.REMOVE and comment.status == PostComment.Status.DELETED:
            return 409, {"error": "Comment already removed"}

        action_record = CommentModerationAction.objects.create(
            comment=comment,
            moderator=request.user,
            action=data.action,
            note=note,
        )
        logger.info(
            "Moderator '%s' applied action '%s' to comment %d (author: '%s')",
            request.user.username, data.action, comment.id, comment.author.username,
        )

        now = timezone.now()
        if data.action == CommentModerationAction.Action.ESCALATE:
            active_reports.update(
                status=CommentModerationReport.Status.ESCALATED,
                reviewed_by=request.user,
                reviewed_at=now,
                updated_at=now,
            )
        elif data.action == CommentModerationAction.Action.DISMISS:
            active_reports.update(
                status=CommentModerationReport.Status.DISMISSED,
                reviewed_by=request.user,
                reviewed_at=now,
                updated_at=now,
            )
        else:
            active_reports.update(
                status=CommentModerationReport.Status.ACTIONED,
                reviewed_by=request.user,
                reviewed_at=now,
                updated_at=now,
            )
            if data.action == CommentModerationAction.Action.REMOVE:
                comment.status = PostComment.Status.DELETED
                comment.save(update_fields=["status", "updated_at"])
            _create_moderation_notification(comment, request.user, action_record, note)

    return 200, _serialize_comment_queue_item(_get_comment_moderation_queue_item(comment.id), request)


# ── Developer Feedback endpoints ──────────────────────────────


# Per-user, per-hub feedback throttle window.
FEEDBACK_COOLDOWN_SECONDS = 60


def _is_developer(user) -> bool:
    try:
        return user.profile.role == UserProfile.Role.DEVELOPER
    except UserProfile.DoesNotExist:
        return False


def _parse_iso_date(value: str):
    try:
        return datetime_class.strptime(value, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


@router.post(
    "/gamehubs/{game_hub_id}/feedback",
    response={
        201: DeveloperFeedbackOut,
        400: ErrorOut,
        401: ErrorOut,
        403: ErrorOut,
        404: ErrorOut,
        429: ErrorOut,
    },
)
def submit_feedback(request, game_hub_id: int, data: DeveloperFeedbackIn):
    """Submit feedback to hub developers with ownership and cooldown checks."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}

    game_hub = get_object_or_404(GameHub, id=game_hub_id)
    message = data.message.strip()
    if not message:
        return 400, {"error": "Message is required"}
    if len(message) > DeveloperFeedback.MAX_MESSAGE_LENGTH:
        return 400, {
            "error": f"Message cannot exceed {DeveloperFeedback.MAX_MESSAGE_LENGTH} characters"
        }

    if game_hub.developers.filter(id=request.user.id).exists():
        return 403, {"error": "You cannot submit feedback to a hub you develop"}

    cooldown_start = timezone.now() - timedelta(seconds=FEEDBACK_COOLDOWN_SECONDS)
    if DeveloperFeedback.objects.filter(
        from_user=request.user,
        game_hub=game_hub,
        created_at__gte=cooldown_start,
    ).exists():
        return 429, {"error": "Please wait a moment before submitting more feedback"}

    feedback = DeveloperFeedback.objects.create(
        game_hub=game_hub,
        from_user=request.user,
        message=message,
    )
    return 201, feedback


@router.get(
    "/developer/gamehubs",
    response={200: List[GameHubOut], 401: ErrorOut, 403: ErrorOut},
)
def list_developer_gamehubs(request):
    """List the game hubs the authenticated developer is assigned to."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}
    if not _is_developer(request.user):
        return 403, {"error": "Developer access required"}

    return 200, request.user.developed_hubs.all().order_by("name")


@router.get(
    "/developer/feedback",
    response={200: List[DeveloperFeedbackOut], 400: ErrorOut, 401: ErrorOut, 403: ErrorOut},
)
def list_developer_feedback(
    request,
    game_hub_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    """List only feedback for hubs assigned to the authenticated developer."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}
    if not _is_developer(request.user):
        return 403, {"error": "Developer access required"}

    parsed_from = _parse_iso_date(date_from) if date_from else None
    parsed_to = _parse_iso_date(date_to) if date_to else None
    if date_from and parsed_from is None:
        return 400, {"error": "Invalid date_from (expected YYYY-MM-DD)"}
    if date_to and parsed_to is None:
        return 400, {"error": "Invalid date_to (expected YYYY-MM-DD)"}
    if parsed_from and parsed_to and parsed_from > parsed_to:
        return 400, {"error": "date_from must be on or before date_to"}

    developer_hub_ids = request.user.developed_hubs.values_list("id", flat=True)

    qs = DeveloperFeedback.objects.filter(
        game_hub_id__in=developer_hub_ids
    ).select_related("game_hub", "from_user")

    if game_hub_id is not None:
        if game_hub_id not in set(developer_hub_ids):
            return 200, []
        qs = qs.filter(game_hub_id=game_hub_id)

    if parsed_from:
        qs = qs.filter(created_at__date__gte=parsed_from)
    if parsed_to:
        qs = qs.filter(created_at__date__lte=parsed_to)

    return 200, qs

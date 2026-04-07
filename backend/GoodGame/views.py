from typing import List

from ninja import File, Form, Router
from ninja.files import UploadedFile
from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout
from django.contrib.auth.models import User
from django.conf import settings
from django.db.models import Count, IntegerField, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404

from .models import GameHub, Post, PostComment, PostVote, Tag
from .schemas import (
    AuthUserOut,
    AvatarOut,
    ErrorOut,
    GameHubOut,
    LoginIn,
    MessageOut,
    PostIn,
    PostCommentOut,
    PostOut,
    PostVoteIn,
    PostVoteSummaryOut,
    PostUpdateIn,
    SignupIn,
    SignupOut,
)

router = Router()


# ── Auth endpoints ────────────────────────────────────────────


@router.post("/signup", response={201: SignupOut, 409: dict})
def signup(request, data: SignupIn):
    if User.objects.filter(username=data.username).exists():
        return 409, {"error": "Username already taken"}

    user = User.objects.create_user(
        username=data.username,
        password=data.password,
        email=data.email,
    )
    return 201, user


@router.post("/auth/login", response={200: AuthUserOut, 401: ErrorOut})
def login(request, data: LoginIn):
    user = authenticate(request, username=data.username, password=data.password)
    if user is None:
        return 401, {"error": "Invalid username or password"}

    auth_login(request, user)
    if data.remember_me:
        request.session.set_expiry(settings.PERSISTENT_LOGIN_AGE_SECONDS)
    else:
        request.session.set_expiry(0)
    return 200, user


@router.post("/auth/logout", response=MessageOut)
def logout(request):
    auth_logout(request)
    return {"message": "Logged out"}


@router.get("/auth/me", response={200: AuthUserOut, 401: ErrorOut})
def me(request):
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}

    return 200, request.user


# ── User profile endpoints ─────────────────────────────────────


@router.put("/users/me/avatar", response={200: AvatarOut, 401: ErrorOut})
def update_avatar(request, file: UploadedFile = File(...)):
    """Upload a new profile picture. Saves to Azure Blob Storage (or local media in dev)."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}

    profile = request.user.profile
    profile.profile_picture.save(file.name, file, save=True)
    return 200, {"url": profile.profile_picture.url}


# ── GameHub endpoints ─────────────────────────────────────────


@router.get("/gamehubs", response=List[GameHubOut])
def list_gamehubs(request):
    """Return all available game hubs (for the forum dropdown)."""
    return GameHub.objects.all()


# ── Post endpoints ────────────────────────────────────────────


def _get_or_create_tags(tag_names: List[str]) -> List[Tag]:
    """Get existing tags or create new ones; returns a list of Tag instances."""
    tags = []
    for name in tag_names[:5]:  # max 5 tags
        tag, _ = Tag.objects.get_or_create(name=name.strip())
        tags.append(tag)
    return tags


def _posts_with_related_data():
    return Post.objects.select_related("game_hub", "author").prefetch_related("tags")


def _annotate_post_stats(queryset):
    vote_totals = PostVote.objects.filter(post_id=OuterRef("pk")).order_by().values("post")
    comment_totals = (
        PostComment.objects.filter(post_id=OuterRef("pk")).order_by().values("post")
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
    )


def _attach_current_user_vote(posts, user):
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
    if not field_file:
        return None

    file_url = field_file.url
    # Already an absolute URL (e.g. Azure Blob Storage) — return as-is.
    if file_url.startswith("http://") or file_url.startswith("https://"):
        return file_url
    # In local dev the Vite proxy handles /media, so a relative path works
    # and avoids returning the Docker-internal hostname (e.g. api:8000).
    if settings.DEBUG:
        return file_url
    return request.build_absolute_uri(file_url)


def _attach_comment_file_fields(comments, request):
    comments = list(comments)
    for comment in comments:
        comment.attachment_name = (
            comment.attachment.name.rsplit("/", 1)[-1] if comment.attachment else None
        )
        comment.attachment_url = _absolute_file_url(request, comment.attachment)
    return comments


@router.post("/posts", response={201: PostOut, 401: ErrorOut, 404: ErrorOut})
def create_post(request, data: PostIn):
    """Create a new post in a game hub."""
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}

    game_hub = get_object_or_404(GameHub, id=data.game_hub_id)

    post = Post.objects.create(
        game_hub=game_hub,
        author=request.user,
        title=data.title,
        body=data.body,
        is_question=data.is_question,
        has_spoilers=data.has_spoilers,
        status=data.status if data.status in ("published", "draft") else "published",
    )

    if data.tags:
        post.tags.set(_get_or_create_tags(data.tags))

    return 201, _get_post_with_stats(post.id, request.user)


@router.get("/posts", response={200: List[PostOut], 401: ErrorOut})
def list_posts(request, game_hub_id: int = None, status: str = "published", mine: bool = False):
    """List public posts or the authenticated user's own posts."""
    qs = _annotate_post_stats(_posts_with_related_data())

    if mine:
        if not request.user.is_authenticated:
            return 401, {"error": "Authentication required"}
        qs = qs.filter(author=request.user).exclude(status=Post.Status.DELETED).order_by("-updated_at")
    else:
        qs = qs.filter(status=status).order_by("-vote_score", "-created_at")

    if game_hub_id:
        qs = qs.filter(game_hub_id=game_hub_id)
    return 200, _attach_current_user_vote(qs, request.user)


@router.get("/posts/{post_id}", response={200: PostOut, 404: ErrorOut})
def get_post(request, post_id: int):
    """Retrieve a single post by id."""
    post = _get_post_with_stats(post_id, request.user)
    if post.status == Post.Status.DELETED:
        return 404, {"error": "Post not found"}
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
        post.game_hub = get_object_or_404(GameHub, id=data.game_hub_id)
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
        PostComment.objects.filter(post=post).select_related("author")
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
        comment.attachment.save(attachment.name, attachment, save=True)

    _attach_comment_file_fields([comment], request)
    return 201, comment

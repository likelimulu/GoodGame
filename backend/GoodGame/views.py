from typing import List

from ninja import Router
from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout
from django.contrib.auth.models import User
from django.conf import settings
from django.shortcuts import get_object_or_404

from .models import GameHub, Post, Tag
from .schemas import (
    AuthUserOut,
    ErrorOut,
    GameHubOut,
    LoginIn,
    MessageOut,
    PostIn,
    PostOut,
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

    return 201, post


@router.get("/posts", response=List[PostOut])
def list_posts(request, game_hub_id: int = None, status: str = "published"):
    """List posts, optionally filtered by game hub and status."""
    qs = Post.objects.select_related("game_hub", "author").prefetch_related("tags")
    qs = qs.filter(status=status)
    if game_hub_id:
        qs = qs.filter(game_hub_id=game_hub_id)
    return qs


@router.get("/posts/{post_id}", response={200: PostOut, 404: ErrorOut})
def get_post(request, post_id: int):
    """Retrieve a single post by id."""
    post = get_object_or_404(
        Post.objects.select_related("game_hub", "author").prefetch_related("tags"),
        id=post_id,
    )
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

    # Refresh relations for serialization
    post = Post.objects.select_related("game_hub", "author").prefetch_related("tags").get(id=post.id)
    return 200, post


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

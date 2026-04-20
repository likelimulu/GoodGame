from django.db import models
from django.contrib.auth.models import User


class UserProfile(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        CONTRIBUTOR = "contributor", "Contributor"
        DEVELOPER = "developer", "Developer"
        MODERATOR = "moderator", "Moderator"

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    name = models.CharField(max_length=100, blank=True)
    phone_number = models.CharField(max_length=20, blank=True)
    profile_picture = models.ImageField(upload_to="profile_pictures/", blank=True)
    reputation_score = models.IntegerField(default=0)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CONTRIBUTOR)

    def __str__(self):
        return f"{self.user.username} profile"


class ModeratorAccessRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="moderator_access_request",
    )
    reason = models.TextField(blank=True)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
    )
    review_note = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_moderator_requests",
    )
    requested_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-requested_at"]

    def __str__(self):
        return f"{self.user.username} moderator request ({self.status})"


class GameHub(models.Model):
    """A dedicated discussion area for a specific game."""
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=120, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Tag(models.Model):
    """Topic tag for posts (e.g. Strategy, Bug, Patch)."""
    name = models.CharField(max_length=40, unique=True)

    def __str__(self):
        return self.name


class Post(models.Model):
    """A structured discussion post within a game hub."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        DELETED = "deleted", "Deleted"

    game_hub = models.ForeignKey(
        GameHub, on_delete=models.CASCADE, related_name="posts"
    )
    author = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="posts"
    )
    title = models.CharField(max_length=300)
    body = models.TextField()
    tags = models.ManyToManyField(Tag, blank=True, related_name="posts")
    is_question = models.BooleanField(default=False)
    has_spoilers = models.BooleanField(default=False)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PUBLISHED,
    )
    is_edited = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class PostVote(models.Model):
    class Value(models.IntegerChoices):
        DOWNVOTE = -1, "Downvote"
        UPVOTE = 1, "Upvote"

    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="votes")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="post_votes")
    value = models.SmallIntegerField(choices=Value.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("post", "user"),
                name="unique_post_vote_per_user",
            ),
            models.CheckConstraint(
                check=models.Q(value__in=[-1, 1]),
                name="post_vote_value_valid",
            ),
        ]

    def __str__(self):
        return f"{self.user.username} -> {self.post_id} ({self.value})"


class PostComment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="post_comments"
    )
    body = models.TextField()
    attachment = models.FileField(upload_to="comment_attachments/", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.author.username} comment on {self.post_id}"


class PostModerationReport(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        ACTIONED = "actioned", "Actioned"
        ESCALATED = "escalated", "Escalated"
        DISMISSED = "dismissed", "Dismissed"

    post = models.ForeignKey(
        Post,
        on_delete=models.CASCADE,
        related_name="moderation_reports",
    )
    reporter = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="submitted_moderation_reports",
    )
    reason = models.TextField()
    status = models.CharField(
        max_length=12,
        choices=Status.choices,
        default=Status.OPEN,
    )
    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_post_reports",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Report {self.id} on post {self.post_id} ({self.status})"


class PostModerationAction(models.Model):
    class Action(models.TextChoices):
        WARN = "warn", "Warn"
        REMOVE = "remove", "Remove"
        ESCALATE = "escalate", "Escalate"
        DISMISS = "dismiss", "Dismiss"

    post = models.ForeignKey(
        Post,
        on_delete=models.CASCADE,
        related_name="moderation_actions",
    )
    moderator = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="post_moderation_actions",
    )
    action = models.CharField(
        max_length=10,
        choices=Action.choices,
    )
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} on post {self.post_id} by {self.moderator.username}"

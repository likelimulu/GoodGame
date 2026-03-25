from django.db import models
from django.contrib.auth.models import User


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    name = models.CharField(max_length=100, blank=True)
    phone_number = models.CharField(max_length=20, blank=True)
    profile_picture = models.URLField(blank=True)  # placeholder: stores image URL
    reputation_score = models.IntegerField(default=0)

    def __str__(self):
        return f"{self.user.username} profile"


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
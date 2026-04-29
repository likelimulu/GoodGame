from django.contrib import admin

from .models import (
    DeveloperFeedback,
    GameHub,
    ModeratorAccessRequest,
    Notification,
    Post,
    PostModerationAction,
    PostModerationReport,
    PostVote,
    Tag,
    UserProfile,
)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "reputation_score")


@admin.register(ModeratorAccessRequest)
class ModeratorAccessRequestAdmin(admin.ModelAdmin):
    list_display = ("user", "status", "requested_at", "reviewed_at", "reviewed_by")
    list_filter = ("status",)
    search_fields = ("user__username", "user__email", "reason", "review_note")


@admin.register(GameHub)
class GameHubAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "developer_count", "created_at")
    prepopulated_fields = {"slug": ("name",)}
    filter_horizontal = ("developers",)

    def developer_count(self, obj):
        return obj.developers.count()
    developer_count.short_description = "Developers"


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ("id", "name")


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ("title", "author", "game_hub", "status", "is_edited", "created_at")
    list_filter = ("status", "game_hub", "is_question", "has_spoilers")
    search_fields = ("title", "body")


@admin.register(PostVote)
class PostVoteAdmin(admin.ModelAdmin):
    list_display = ("post", "user", "value", "updated_at")
    list_filter = ("value",)
    search_fields = ("post__title", "user__username")


@admin.register(PostModerationReport)
class PostModerationReportAdmin(admin.ModelAdmin):
    list_display = ("post", "reporter", "status", "created_at", "reviewed_by")
    list_filter = ("status",)
    search_fields = ("post__title", "reporter__username", "reason")


@admin.register(PostModerationAction)
class PostModerationActionAdmin(admin.ModelAdmin):
    list_display = ("post", "moderator", "action", "created_at")
    list_filter = ("action",)
    search_fields = ("post__title", "moderator__username", "note")


@admin.register(DeveloperFeedback)
class DeveloperFeedbackAdmin(admin.ModelAdmin):
    list_display = ("game_hub", "from_user", "created_at")
    list_filter = ("game_hub",)
    search_fields = ("game_hub__name", "from_user__username", "message")
    readonly_fields = ("created_at",)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("title", "recipient", "type", "is_read", "created_at")
    list_filter = ("type", "is_read")
    search_fields = ("title", "message", "recipient__username", "post__title")

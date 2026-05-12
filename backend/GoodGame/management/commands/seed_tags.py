from django.core.management.base import BaseCommand

from GoodGame.models import Tag

COMMON_TAGS = [
    # Gameplay & skill
    "tips", "strategy", "guide", "beginner", "advanced", "meta", "builds", "loadout",
    # Game modes
    "ranked", "competitive", "casual", "multiplayer", "co-op", "pvp", "pve", "solo",
    # Updates & issues
    "patch", "update", "bug", "glitch", "nerf", "buff",
    # Content & story
    "lore", "story", "quest", "dlc", "event", "spoiler",
    # Community
    "discussion", "question", "help", "review", "highlight", "clip", "feedback", "rant",
]


class Command(BaseCommand):
    help = "Seed the database with common gaming tags"

    def handle(self, *args, **options):
        created = 0
        for name in COMMON_TAGS:
            _, was_created = Tag.objects.get_or_create(name=name)
            if was_created:
                created += 1
        self.stdout.write(
            self.style.SUCCESS(
                f"Done: {created} tag(s) created, {len(COMMON_TAGS) - created} already existed."
            )
        )

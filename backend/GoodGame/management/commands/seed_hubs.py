from django.core.management.base import BaseCommand
from django.utils.text import slugify

from GoodGame.models import GameHub

HUBS = [
    "Super Smash Bros",
    "League of Legends",
    "Valorant",
    "Minecraft",
    "Elden Ring",
    "Counter-Strike 2",
]


class Command(BaseCommand):
    help = "Seed the database with default game hubs"

    def handle(self, *args, **options):
        created = 0
        for name in HUBS:
            _, was_created = GameHub.objects.get_or_create(
                slug=slugify(name),
                defaults={"name": name},
            )
            if was_created:
                created += 1

        self.stdout.write(
            self.style.SUCCESS(f"Done: {created} hub(s) created, {len(HUBS) - created} already existed.")
        )

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.utils.text import slugify

from GoodGame.models import GameHub, UserProfile

TEST_PASSWORD = "TestPass123!"

TEST_USERS = [
    {"username": "test_contributor_1", "role": UserProfile.Role.CONTRIBUTOR},
    {"username": "test_contributor_2", "role": UserProfile.Role.CONTRIBUTOR},
    {"username": "test_contributor_3", "role": UserProfile.Role.CONTRIBUTOR},
    {"username": "test_developer_nintendo", "role": UserProfile.Role.DEVELOPER, "hub": "Nintendo"},
    {"username": "test_developer_bethesda", "role": UserProfile.Role.DEVELOPER, "hub": "Bethesda"},
    {"username": "test_developer_sony", "role": UserProfile.Role.DEVELOPER, "hub": "Sony"},
    {"username": "test_admin_1", "role": UserProfile.Role.ADMIN},
    {"username": "test_admin_2", "role": UserProfile.Role.ADMIN},
    {"username": "test_admin_3", "role": UserProfile.Role.ADMIN},
    {"username": "test_moderator_1", "role": UserProfile.Role.MODERATOR},
    {"username": "test_moderator_2", "role": UserProfile.Role.MODERATOR},
    {"username": "test_moderator_3", "role": UserProfile.Role.MODERATOR},
]


class Command(BaseCommand):
    help = "Seed the database with global test users (idempotent)"

    def handle(self, *args, **options):
        created = 0
        updated = 0
        for entry in TEST_USERS:
            username = entry["username"]
            role = entry["role"]
            user, was_created = User.objects.get_or_create(
                username=username,
                defaults={"email": f"{username}@test.com"},
            )
            if was_created:
                user.set_password(TEST_PASSWORD)
                user.save()
                created += 1

            profile = user.profile
            changed = False
            if profile.role != role:
                profile.role = role
                changed = True
            if not profile.email_verified:
                profile.email_verified = True
                changed = True
            if changed:
                profile.save()
                if not was_created:
                    updated += 1

            if "hub" in entry:
                hub_name = entry["hub"]
                hub, _ = GameHub.objects.get_or_create(
                    slug=slugify(hub_name),
                    defaults={"name": hub_name},
                )
                hub.developers.add(user)

        self.stdout.write(
            self.style.SUCCESS(
                f"Done: {created} user(s) created, {updated} user(s) updated, "
                f"{len(TEST_USERS) - created - updated} already up to date."
            )
        )
        self.stdout.write(f"Password for all test users: {TEST_PASSWORD}")

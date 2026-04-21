from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.contrib.auth.models import User

from .models import PostVote, UserProfile


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)


def _recalculate_reputation(user):
    """Reputation = sum of all votes received on the user's posts."""
    total = (
        PostVote.objects.filter(post__author=user)
        .aggregate(total=__import__("django").db.models.Sum("value"))["total"]
    ) or 0
    UserProfile.objects.filter(user=user).update(reputation_score=total)


@receiver(post_save, sender=PostVote)
def update_reputation_on_vote(sender, instance, **kwargs):
    _recalculate_reputation(instance.post.author)


@receiver(post_delete, sender=PostVote)
def update_reputation_on_vote_delete(sender, instance, **kwargs):
    _recalculate_reputation(instance.post.author)

from django.apps import AppConfig


class GoodgameConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'GoodGame'

    def ready(self):
        import GoodGame.signals  # noqa: F401

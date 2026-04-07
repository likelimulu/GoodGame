from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path
from ninja import NinjaAPI

from GoodGame.views import router as goodgame_router

api = NinjaAPI()
api.add_router("/", goodgame_router)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', api.urls),
]

if settings.DEBUG and getattr(settings, "MEDIA_ROOT", None):
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

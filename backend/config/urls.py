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

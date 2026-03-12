from ninja import Router
from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout
from django.contrib.auth.models import User
from django.conf import settings

from .schemas import AuthUserOut, ErrorOut, LoginIn, MessageOut, SignupIn, SignupOut

router = Router()


@router.post("/signup", response={201: SignupOut, 409: dict})
def signup(request, data: SignupIn):
    if User.objects.filter(username=data.username).exists():
        return 409, {"error": "Username already taken"}

    user = User.objects.create_user(
        username=data.username,
        password=data.password,
        email=data.email,
    )
    return 201, user


@router.post("/auth/login", response={200: AuthUserOut, 401: ErrorOut})
def login(request, data: LoginIn):
    user = authenticate(request, username=data.username, password=data.password)
    if user is None:
        return 401, {"error": "Invalid username or password"}

    auth_login(request, user)
    if data.remember_me:
        request.session.set_expiry(settings.PERSISTENT_LOGIN_AGE_SECONDS)
    else:
        request.session.set_expiry(0)
    return 200, user


@router.post("/auth/logout", response=MessageOut)
def logout(request):
    auth_logout(request)
    return {"message": "Logged out"}


@router.get("/auth/me", response={200: AuthUserOut, 401: ErrorOut})
def me(request):
    if not request.user.is_authenticated:
        return 401, {"error": "Authentication required"}

    return 200, request.user

from ninja import Router
from django.contrib.auth.models import User

from .schemas import SignupIn, SignupOut

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

from ninja import Schema


class SignupIn(Schema):
    username: str
    password: str
    email: str


class SignupOut(Schema):
    id: int
    username: str


class LoginIn(Schema):
    username: str
    password: str
    remember_me: bool = False


class AuthUserOut(Schema):
    id: int
    username: str
    email: str


class ErrorOut(Schema):
    error: str


class MessageOut(Schema):
    message: str

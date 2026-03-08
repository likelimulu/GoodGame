from ninja import Schema


class SignupIn(Schema):
    username: str
    password: str
    email: str


class SignupOut(Schema):
    id: int
    username: str

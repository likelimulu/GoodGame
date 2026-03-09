import json

from django.contrib.auth.models import User
from django.test import TestCase


class AuthSessionApiTests(TestCase):
    def setUp(self):
        self.username = "testuser"
        self.password = "secure-pass-123"
        self.user = User.objects.create_user(
            username=self.username,
            password=self.password,
            email="testuser@example.com",
        )

    def test_login_creates_session(self):
        response = self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": self.username, "password": self.password}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["username"], self.username)
        self.assertEqual(str(self.client.session.get("_auth_user_id")), str(self.user.id))

    def test_login_fails_with_invalid_credentials(self):
        response = self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": self.username, "password": "wrong-password"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"], "Invalid username or password")

    def test_me_requires_authentication(self):
        response = self.client.get("/api/auth/me")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"], "Authentication required")

    def test_logout_clears_session(self):
        login_response = self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": self.username, "password": self.password}),
            content_type="application/json",
        )
        self.assertEqual(login_response.status_code, 200)
        self.assertIn("_auth_user_id", self.client.session)

        logout_response = self.client.post("/api/auth/logout")
        self.assertEqual(logout_response.status_code, 200)
        self.assertEqual(logout_response.json()["message"], "Logged out")

        me_response = self.client.get("/api/auth/me")
        self.assertEqual(me_response.status_code, 401)

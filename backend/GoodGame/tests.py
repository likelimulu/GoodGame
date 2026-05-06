import json
from datetime import timedelta

from django.contrib.auth.models import User
from django.conf import settings
from django.test import Client, TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from .models import (
    DeveloperFeedback,
    EmailVerificationToken,
    GameHub,
    ModeratorAccessRequest,
    Notification,
    Post,
    PostComment,
    PostModerationAction,
    PostModerationReport,
    PostVote,
    Tag,
    UserProfile,
)


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
        self.assertEqual(response.json()["role"], UserProfile.Role.CONTRIBUTOR)
        self.assertEqual(str(self.client.session.get("_auth_user_id")), str(self.user.id))
        self.assertTrue(self.client.session.get_expire_at_browser_close())

    def test_login_with_remember_me_sets_persistent_expiry(self):
        response = self.client.post(
            "/api/auth/login",
            data=json.dumps(
                {
                    "username": self.username,
                    "password": self.password,
                    "remember_me": True,
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(self.client.session.get_expire_at_browser_close())
        expiry_age = self.client.session.get_expiry_age()
        self.assertGreaterEqual(expiry_age, settings.PERSISTENT_LOGIN_AGE_SECONDS - 5)
        self.assertLessEqual(expiry_age, settings.PERSISTENT_LOGIN_AGE_SECONDS)

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

    def test_me_returns_role(self):
        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": self.username, "password": self.password}),
            content_type="application/json",
        )

        response = self.client.get("/api/auth/me")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["role"], UserProfile.Role.CONTRIBUTOR)


    def test_login_with_nonexistent_username_returns_401(self):
        response = self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": "nobody", "password": "any-password"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"], "Invalid username or password")

    def test_logout_when_not_authenticated_succeeds(self):
        response = self.client.post("/api/auth/logout")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], "Logged out")

    def test_me_returns_email_verified_field(self):
        self.user.profile.email_verified = True
        self.user.profile.save()
        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": self.username, "password": self.password}),
            content_type="application/json",
        )
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 200)
        self.assertIn("email_verified", response.json())
        self.assertTrue(response.json()["email_verified"])


class SignupApiTests(TestCase):
    def test_signup_creates_user(self):
        response = self.client.post(
            "/api/signup",
            data=json.dumps({
                "username": "newplayer",
                "password": "strong-pass-456",
                "email": "newplayer@example.com",
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["username"], "newplayer")
        self.assertTrue(User.objects.filter(username="newplayer").exists())
        self.assertEqual(
            User.objects.get(username="newplayer").profile.role,
            UserProfile.Role.CONTRIBUTOR,
        )

    def test_signup_duplicate_username(self):
        User.objects.create_user(username="taken", password="pass", email="a@b.com")
        response = self.client.post(
            "/api/signup",
            data=json.dumps({
                "username": "taken",
                "password": "another-pass",
                "email": "c@d.com",
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)


class UserRoleApiTests(TestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            username="adminuser",
            password="admin-pass-123",
            email="admin@example.com",
        )
        self.admin_user.profile.role = UserProfile.Role.ADMIN
        self.admin_user.profile.save()

        self.target_user = User.objects.create_user(
            username="targetuser",
            password="target-pass-123",
            email="target@example.com",
        )

    def test_update_user_role_requires_authentication(self):
        response = self.client.put(
            f"/api/users/{self.target_user.id}/role",
            data=json.dumps({"role": UserProfile.Role.MODERATOR}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 401)

    def test_update_user_role_requires_admin(self):
        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": "targetuser", "password": "target-pass-123"}),
            content_type="application/json",
        )

        response = self.client.put(
            f"/api/users/{self.target_user.id}/role",
            data=json.dumps({"role": UserProfile.Role.MODERATOR}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"], "Admin access required")

    def test_admin_can_update_user_role(self):
        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": "adminuser", "password": "admin-pass-123"}),
            content_type="application/json",
        )

        response = self.client.put(
            f"/api/users/{self.target_user.id}/role",
            data=json.dumps({"role": UserProfile.Role.MODERATOR}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.target_user.refresh_from_db()
        self.target_user.profile.refresh_from_db()
        self.assertEqual(self.target_user.profile.role, UserProfile.Role.MODERATOR)
        self.assertEqual(response.json()["role"], UserProfile.Role.MODERATOR)


    def test_admin_update_nonexistent_user_role_returns_404(self):
        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": "adminuser", "password": "admin-pass-123"}),
            content_type="application/json",
        )
        response = self.client.put(
            "/api/users/99999/role",
            data=json.dumps({"role": UserProfile.Role.MODERATOR}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

    def test_admin_can_promote_user_to_developer_role(self):
        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": "adminuser", "password": "admin-pass-123"}),
            content_type="application/json",
        )
        response = self.client.put(
            f"/api/users/{self.target_user.id}/role",
            data=json.dumps({"role": UserProfile.Role.DEVELOPER}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.target_user.profile.refresh_from_db()
        self.assertEqual(self.target_user.profile.role, UserProfile.Role.DEVELOPER)


class ModeratorAccessRequestApiTests(TestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            username="adminmod",
            password="admin-pass-123",
            email="adminmod@example.com",
        )
        self.admin_user.profile.role = UserProfile.Role.ADMIN
        self.admin_user.profile.save()

        self.request_user = User.objects.create_user(
            username="requester",
            password="request-pass-123",
            email="requester@example.com",
        )

    def _login(self, username, password):
        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": username, "password": password}),
            content_type="application/json",
        )

    def test_create_moderator_request_requires_authentication(self):
        response = self.client.post(
            "/api/users/me/moderator-request",
            data=json.dumps({"reason": "I help review strategy threads"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 401)

    def test_create_moderator_request_creates_pending_request(self):
        self._login("requester", "request-pass-123")

        response = self.client.post(
            "/api/users/me/moderator-request",
            data=json.dumps({"reason": "I help review strategy threads"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["status"], ModeratorAccessRequest.Status.PENDING)
        self.assertEqual(response.json()["user"]["username"], "requester")
        self.assertEqual(response.json()["user"]["role"], UserProfile.Role.CONTRIBUTOR)
        self.assertTrue(ModeratorAccessRequest.objects.filter(user=self.request_user).exists())

    def test_create_moderator_request_conflicts_when_pending_exists(self):
        ModeratorAccessRequest.objects.create(user=self.request_user, reason="First request")
        self._login("requester", "request-pass-123")

        response = self.client.post(
            "/api/users/me/moderator-request",
            data=json.dumps({"reason": "Second request"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"], "Moderator request already pending")

    def test_non_admin_cannot_list_requests(self):
        self._login("requester", "request-pass-123")

        response = self.client.get("/api/moderator-requests")

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"], "Admin access required")

    def test_admin_can_list_requests(self):
        request_record = ModeratorAccessRequest.objects.create(
            user=self.request_user,
            reason="I can help moderate spoiler-heavy threads",
        )
        self._login("adminmod", "admin-pass-123")

        response = self.client.get("/api/moderator-requests")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["id"], request_record.id)
        self.assertEqual(response.json()[0]["user"]["username"], "requester")

    def test_admin_can_approve_request_and_promote_user(self):
        request_record = ModeratorAccessRequest.objects.create(
            user=self.request_user,
            reason="I can help moderate spoiler-heavy threads",
        )
        self._login("adminmod", "admin-pass-123")

        response = self.client.put(
            f"/api/moderator-requests/{request_record.id}",
            data=json.dumps({"status": "approved", "review_note": "Approved for Sprint 6 moderation queue"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        request_record.refresh_from_db()
        self.request_user.refresh_from_db()
        self.request_user.profile.refresh_from_db()
        self.assertEqual(request_record.status, ModeratorAccessRequest.Status.APPROVED)
        self.assertEqual(request_record.reviewed_by_id, self.admin_user.id)
        self.assertEqual(self.request_user.profile.role, UserProfile.Role.MODERATOR)
        self.assertEqual(response.json()["status"], ModeratorAccessRequest.Status.APPROVED)
        self.assertEqual(response.json()["reviewed_by_username"], "adminmod")

    def test_admin_can_reject_request_without_role_change(self):
        request_record = ModeratorAccessRequest.objects.create(
            user=self.request_user,
            reason="I can help moderate spoiler-heavy threads",
        )
        self._login("adminmod", "admin-pass-123")

        response = self.client.put(
            f"/api/moderator-requests/{request_record.id}",
            data=json.dumps({"status": "rejected", "review_note": "Need more activity first"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        request_record.refresh_from_db()
        self.request_user.profile.refresh_from_db()
        self.assertEqual(request_record.status, ModeratorAccessRequest.Status.REJECTED)
        self.assertEqual(self.request_user.profile.role, UserProfile.Role.CONTRIBUTOR)


    def test_list_requests_requires_authentication(self):
        response = self.client.get("/api/moderator-requests")
        self.assertEqual(response.status_code, 401)

    def test_review_request_requires_authentication(self):
        request_record = ModeratorAccessRequest.objects.create(
            user=self.request_user, reason="Test"
        )
        response = self.client.put(
            f"/api/moderator-requests/{request_record.id}",
            data=json.dumps({"status": "approved"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)

    def test_review_request_requires_admin_access(self):
        request_record = ModeratorAccessRequest.objects.create(
            user=self.request_user, reason="Test"
        )
        self._login("requester", "request-pass-123")
        response = self.client.put(
            f"/api/moderator-requests/{request_record.id}",
            data=json.dumps({"status": "approved"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)

    def test_review_nonexistent_request_returns_404(self):
        self._login("adminmod", "admin-pass-123")
        response = self.client.put(
            "/api/moderator-requests/99999",
            data=json.dumps({"status": "approved"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

    def test_review_already_reviewed_request_returns_409(self):
        request_record = ModeratorAccessRequest.objects.create(
            user=self.request_user,
            reason="Test",
            status=ModeratorAccessRequest.Status.APPROVED,
        )
        self._login("adminmod", "admin-pass-123")
        response = self.client.put(
            f"/api/moderator-requests/{request_record.id}",
            data=json.dumps({"status": "rejected"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"], "Moderator request already reviewed")

    def test_user_with_moderator_role_cannot_create_request(self):
        self.request_user.profile.role = UserProfile.Role.MODERATOR
        self.request_user.profile.save()
        self._login("requester", "request-pass-123")
        response = self.client.post(
            "/api/users/me/moderator-request",
            data=json.dumps({"reason": "Already a mod"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"], "User already has moderation access")

    def test_user_with_admin_role_cannot_create_request(self):
        self.request_user.profile.role = UserProfile.Role.ADMIN
        self.request_user.profile.save()
        self._login("requester", "request-pass-123")
        response = self.client.post(
            "/api/users/me/moderator-request",
            data=json.dumps({"reason": "Already admin"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"], "User already has moderation access")

    def test_admin_can_filter_requests_by_pending_status(self):
        pending_user = User.objects.create_user(
            username="pending_user", password="pass-123", email="pending@example.com"
        )
        approved_user = User.objects.create_user(
            username="approved_user", password="pass-456", email="approved@example.com"
        )
        pending = ModeratorAccessRequest.objects.create(
            user=pending_user, reason="Pending"
        )
        ModeratorAccessRequest.objects.create(
            user=approved_user,
            reason="Approved",
            status=ModeratorAccessRequest.Status.APPROVED,
        )
        self._login("adminmod", "admin-pass-123")

        response = self.client.get("/api/moderator-requests?status=pending")

        self.assertEqual(response.status_code, 200)
        ids = [r["id"] for r in response.json()]
        self.assertIn(pending.id, ids)
        self.assertEqual(len(ids), 1)


class GameHubApiTests(TestCase):
    def setUp(self):
        GameHub.objects.create(name="Valorant Hub", slug="valorant-hub")
        GameHub.objects.create(name="Minecraft Hub", slug="minecraft-hub")

    def test_list_gamehubs(self):
        response = self.client.get("/api/gamehubs")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)
        names = {h["name"] for h in data}
        self.assertIn("Valorant Hub", names)
        self.assertIn("Minecraft Hub", names)


class SearchApiTests(TestCase):
    def setUp(self):
        self.author = User.objects.create_user(
            username="riftsage",
            password="pass-123",
            email="riftsage@example.com",
        )
        self.viewer = User.objects.create_user(
            username="viewer",
            password="pass-456",
            email="viewer@example.com",
        )
        self.hub = GameHub.objects.create(name="Crystal Rift", slug="crystal-rift")
        self.other_hub = GameHub.objects.create(name="Aurora Arena", slug="aurora-arena")

    def _login(self):
        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": "viewer", "password": "pass-456"}),
            content_type="application/json",
        )

    def test_search_short_or_empty_query_returns_empty_groups(self):
        empty_response = self.client.get("/api/search")
        short_response = self.client.get("/api/search?q=x")

        expected = {"posts": [], "game_hubs": [], "tags": [], "users": []}
        self.assertEqual(empty_response.status_code, 200)
        self.assertEqual(empty_response.json(), expected)
        self.assertEqual(short_response.status_code, 200)
        self.assertEqual(short_response.json(), expected)

    def test_search_posts_by_title_and_body_without_comments(self):
        title_post = Post.objects.create(
            game_hub=self.hub,
            author=self.author,
            title="Zephyr live patch",
            body="Ranked notes",
            status=Post.Status.PUBLISHED,
        )
        body_post = Post.objects.create(
            game_hub=self.hub,
            author=self.author,
            title="Body search",
            body="The zephyr route changed overnight.",
            status=Post.Status.PUBLISHED,
        )
        Post.objects.create(
            game_hub=self.hub,
            author=self.author,
            title="Zephyr draft leak",
            body="Not public",
            status=Post.Status.DRAFT,
        )
        Post.objects.create(
            game_hub=self.hub,
            author=self.author,
            title="Zephyr deleted leak",
            body="Removed",
            status=Post.Status.DELETED,
        )
        comment_only_post = Post.objects.create(
            game_hub=self.hub,
            author=self.author,
            title="Ordinary thread",
            body="No matching post text",
            status=Post.Status.PUBLISHED,
        )
        PostComment.objects.create(
            post=comment_only_post,
            author=self.viewer,
            body="Zephyr only appears in this comment.",
        )

        response = self.client.get("/api/search?q=zephyr")

        self.assertEqual(response.status_code, 200)
        result_ids = {post["id"] for post in response.json()["posts"]}
        self.assertIn(title_post.id, result_ids)
        self.assertIn(body_post.id, result_ids)
        self.assertNotIn(comment_only_post.id, result_ids)
        result_titles = {post["title"] for post in response.json()["posts"]}
        self.assertNotIn("Zephyr draft leak", result_titles)
        self.assertNotIn("Zephyr deleted leak", result_titles)

    def test_search_tag_name_returns_tag_and_related_published_post_once(self):
        raid_tag = Tag.objects.create(name="Raid")
        raiders_tag = Tag.objects.create(name="Raiders")
        tagged_post = Post.objects.create(
            game_hub=self.other_hub,
            author=self.author,
            title="Endgame routes",
            body="Coordinate squads before launch.",
            status=Post.Status.PUBLISHED,
        )
        tagged_post.tags.set([raid_tag, raiders_tag])

        response = self.client.get("/api/search?q=raid")

        self.assertEqual(response.status_code, 200)
        self.assertIn("Raid", {tag["name"] for tag in response.json()["tags"]})
        result_ids = [post["id"] for post in response.json()["posts"]]
        self.assertEqual(result_ids.count(tagged_post.id), 1)

    def test_search_game_hub_name_returns_hub_and_related_published_posts(self):
        hub_post = Post.objects.create(
            game_hub=self.hub,
            author=self.author,
            title="Rotation notes",
            body="Coordinate the opener.",
            status=Post.Status.PUBLISHED,
        )
        draft_post = Post.objects.create(
            game_hub=self.hub,
            author=self.author,
            title="Private rotation",
            body="Draft notes",
            status=Post.Status.DRAFT,
        )

        response = self.client.get("/api/search?q=crystal")

        self.assertEqual(response.status_code, 200)
        self.assertIn(self.hub.id, {hub["id"] for hub in response.json()["game_hubs"]})
        result_ids = {post["id"] for post in response.json()["posts"]}
        self.assertIn(hub_post.id, result_ids)
        self.assertNotIn(draft_post.id, result_ids)

    def test_search_author_username_returns_user_and_related_published_posts(self):
        authored_post = Post.objects.create(
            game_hub=self.other_hub,
            author=self.author,
            title="Meta setup",
            body="Open with utility.",
            status=Post.Status.PUBLISHED,
        )

        response = self.client.get("/api/search?q=riftsage")

        self.assertEqual(response.status_code, 200)
        self.assertIn(self.author.id, {user["id"] for user in response.json()["users"]})
        self.assertIn(authored_post.id, {post["id"] for post in response.json()["posts"]})

    def test_search_works_logged_in_with_current_user_vote(self):
        voted_post = Post.objects.create(
            game_hub=self.hub,
            author=self.author,
            title="Obsidian timing",
            body="Hold the lane.",
            status=Post.Status.PUBLISHED,
        )
        PostVote.objects.create(post=voted_post, user=self.viewer, value=PostVote.Value.UPVOTE)

        self._login()
        response = self.client.get("/api/search?q=obsidian")

        self.assertEqual(response.status_code, 200)
        result = response.json()["posts"][0]
        self.assertEqual(result["id"], voted_post.id)
        self.assertEqual(result["current_user_vote"], 1)


class PostApiTests(TestCase):
    """Tests for the Post CRUD API (GG-52)."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="poster", password="pass-123", email="poster@example.com"
        )
        self.other_user = User.objects.create_user(
            username="other", password="pass-456", email="other@example.com"
        )
        self.hub = GameHub.objects.create(name="Valorant Hub", slug="valorant-hub")

    def _login(self, username="poster", password="pass-123"):
        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": username, "password": password}),
            content_type="application/json",
        )

    # ── Create ────────────────────────────────────────────────

    def test_create_post_published(self):
        self._login()
        response = self.client.post(
            "/api/posts",
            data=json.dumps({
                "game_hub_id": self.hub.id,
                "title": "Best Valorant settings",
                "body": "Here are my recommended settings...",
                "tags": ["Strategy", "Ranked"],
                "is_question": False,
                "has_spoilers": False,
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["title"], "Best Valorant settings")
        self.assertEqual(body["status"], "published")
        self.assertEqual(body["author"]["username"], "poster")
        self.assertEqual(len(body["tags"]), 2)

    def test_create_post_as_draft(self):
        self._login()
        response = self.client.post(
            "/api/posts",
            data=json.dumps({
                "game_hub_id": self.hub.id,
                "title": "Draft post",
                "body": "WIP...",
                "status": "draft",
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["status"], "draft")

    def test_create_post_requires_auth(self):
        response = self.client.post(
            "/api/posts",
            data=json.dumps({
                "game_hub_id": self.hub.id,
                "title": "No auth",
                "body": "...",
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)

    def test_create_post_invalid_hub(self):
        self._login()
        response = self.client.post(
            "/api/posts",
            data=json.dumps({
                "game_hub_id": 9999,
                "title": "Bad hub",
                "body": "...",
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

    def test_create_post_max_five_tags(self):
        self._login()
        response = self.client.post(
            "/api/posts",
            data=json.dumps({
                "game_hub_id": self.hub.id,
                "title": "Tag limit test",
                "body": "...",
                "tags": ["A", "B", "C", "D", "E", "F", "G"],
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.json()["tags"]), 5)

    # ── List / Get ────────────────────────────────────────────

    def test_list_posts_returns_published_only(self):
        self._login()
        # Create one published, one draft
        self.client.post(
            "/api/posts",
            data=json.dumps({"game_hub_id": self.hub.id, "title": "Pub", "body": "x"}),
            content_type="application/json",
        )
        self.client.post(
            "/api/posts",
            data=json.dumps({"game_hub_id": self.hub.id, "title": "Drft", "body": "x", "status": "draft"}),
            content_type="application/json",
        )

        response = self.client.get("/api/posts")
        self.assertEqual(response.status_code, 200)
        titles = [p["title"] for p in response.json()]
        self.assertIn("Pub", titles)
        self.assertNotIn("Drft", titles)

    def test_list_posts_filter_by_hub(self):
        hub2 = GameHub.objects.create(name="Minecraft Hub", slug="minecraft-hub")
        self._login()
        self.client.post(
            "/api/posts",
            data=json.dumps({"game_hub_id": self.hub.id, "title": "Val post", "body": "x"}),
            content_type="application/json",
        )
        self.client.post(
            "/api/posts",
            data=json.dumps({"game_hub_id": hub2.id, "title": "MC post", "body": "x"}),
            content_type="application/json",
        )

        response = self.client.get(f"/api/posts?game_hub_id={self.hub.id}")
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["title"], "Val post")

    def test_list_my_posts_requires_auth(self):
        response = self.client.get("/api/posts?mine=true")
        self.assertEqual(response.status_code, 401)

    def test_list_my_posts_returns_owned_posts_including_drafts(self):
        self._login()
        own_published = Post.objects.create(
            game_hub=self.hub,
            author=self.user,
            title="Own published",
            body="visible",
            status=Post.Status.PUBLISHED,
        )
        own_draft = Post.objects.create(
            game_hub=self.hub,
            author=self.user,
            title="Own draft",
            body="draft",
            status=Post.Status.DRAFT,
        )
        Post.objects.create(
            game_hub=self.hub,
            author=self.other_user,
            title="Other post",
            body="not mine",
            status=Post.Status.PUBLISHED,
        )
        Post.objects.create(
            game_hub=self.hub,
            author=self.user,
            title="Deleted mine",
            body="gone",
            status=Post.Status.DELETED,
        )

        response = self.client.get("/api/posts?mine=true")
        self.assertEqual(response.status_code, 200)
        titles = [post["title"] for post in response.json()]
        self.assertIn(own_published.title, titles)
        self.assertIn(own_draft.title, titles)
        self.assertNotIn("Other post", titles)
        self.assertNotIn("Deleted mine", titles)

    def test_get_single_post(self):
        self._login()
        create_resp = self.client.post(
            "/api/posts",
            data=json.dumps({"game_hub_id": self.hub.id, "title": "Solo", "body": "Details"}),
            content_type="application/json",
        )
        post_id = create_resp.json()["id"]

        response = self.client.get(f"/api/posts/{post_id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["title"], "Solo")

    def test_get_deleted_post_returns_404(self):
        self._login()
        create_resp = self.client.post(
            "/api/posts",
            data=json.dumps({"game_hub_id": self.hub.id, "title": "ToDelete", "body": "x"}),
            content_type="application/json",
        )
        post_id = create_resp.json()["id"]
        self.client.delete(f"/api/posts/{post_id}")

        response = self.client.get(f"/api/posts/{post_id}")
        self.assertEqual(response.status_code, 404)

    # ── Update ────────────────────────────────────────────────

    def test_update_post(self):
        self._login()
        create_resp = self.client.post(
            "/api/posts",
            data=json.dumps({"game_hub_id": self.hub.id, "title": "Original", "body": "old"}),
            content_type="application/json",
        )
        post_id = create_resp.json()["id"]

        response = self.client.put(
            f"/api/posts/{post_id}",
            data=json.dumps({"title": "Updated", "tags": ["Patch"]}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["title"], "Updated")
        self.assertTrue(body["is_edited"])
        self.assertEqual(len(body["tags"]), 1)

    def test_update_post_can_change_game_hub(self):
        hub2 = GameHub.objects.create(name="Minecraft Hub", slug="minecraft-hub")
        self._login()
        create_resp = self.client.post(
            "/api/posts",
            data=json.dumps({"game_hub_id": self.hub.id, "title": "Original", "body": "old"}),
            content_type="application/json",
        )
        post_id = create_resp.json()["id"]

        response = self.client.put(
            f"/api/posts/{post_id}",
            data=json.dumps({"game_hub_id": hub2.id}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["game_hub"]["id"], hub2.id)

    def test_update_post_forbidden_for_other_user(self):
        self._login()
        create_resp = self.client.post(
            "/api/posts",
            data=json.dumps({"game_hub_id": self.hub.id, "title": "Mine", "body": "x"}),
            content_type="application/json",
        )
        post_id = create_resp.json()["id"]

        # Login as another user
        self._login(username="other", password="pass-456")
        response = self.client.put(
            f"/api/posts/{post_id}",
            data=json.dumps({"title": "Hacked"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)

    # ── Delete ────────────────────────────────────────────────

    def test_delete_post_soft_deletes(self):
        self._login()
        create_resp = self.client.post(
            "/api/posts",
            data=json.dumps({"game_hub_id": self.hub.id, "title": "Bye", "body": "x"}),
            content_type="application/json",
        )
        post_id = create_resp.json()["id"]

        response = self.client.delete(f"/api/posts/{post_id}")
        self.assertEqual(response.status_code, 200)

        # Still exists in DB but with deleted status
        post = Post.objects.get(id=post_id)
        self.assertEqual(post.status, Post.Status.DELETED)

    def test_delete_post_forbidden_for_other_user(self):
        self._login()
        create_resp = self.client.post(
            "/api/posts",
            data=json.dumps({"game_hub_id": self.hub.id, "title": "Protected", "body": "x"}),
            content_type="application/json",
        )
        post_id = create_resp.json()["id"]

        self._login(username="other", password="pass-456")
        response = self.client.delete(f"/api/posts/{post_id}")
        self.assertEqual(response.status_code, 403)

    # ── Developer hub authority ────────────────────────────────

    def test_developer_can_post_in_assigned_hub(self):
        dev = User.objects.create_user(
            username="dev", password="dev-pass-123", email="dev@example.com"
        )
        dev.profile.role = UserProfile.Role.DEVELOPER
        dev.profile.save()
        self.hub.developers.add(dev)

        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": "dev", "password": "dev-pass-123"}),
            content_type="application/json",
        )
        response = self.client.post(
            "/api/posts",
            data=json.dumps({"game_hub_id": self.hub.id, "title": "Dev post", "body": "Hello"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)

    def test_developer_cannot_post_in_unassigned_hub(self):
        dev = User.objects.create_user(
            username="dev", password="dev-pass-123", email="dev@example.com"
        )
        dev.profile.role = UserProfile.Role.DEVELOPER
        dev.profile.save()
        other_hub = GameHub.objects.create(name="Other Hub", slug="other-hub")

        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": "dev", "password": "dev-pass-123"}),
            content_type="application/json",
        )
        response = self.client.post(
            "/api/posts",
            data=json.dumps({"game_hub_id": other_hub.id, "title": "Sneaky post", "body": "x"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)

    def test_developer_cannot_move_post_to_unassigned_hub(self):
        dev = User.objects.create_user(
            username="dev", password="dev-pass-123", email="dev@example.com"
        )
        dev.profile.role = UserProfile.Role.DEVELOPER
        dev.profile.save()
        self.hub.developers.add(dev)
        other_hub = GameHub.objects.create(name="Other Hub", slug="other-hub")

        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": "dev", "password": "dev-pass-123"}),
            content_type="application/json",
        )
        create_resp = self.client.post(
            "/api/posts",
            data=json.dumps({"game_hub_id": self.hub.id, "title": "Dev post", "body": "Hello"}),
            content_type="application/json",
        )
        post_id = create_resp.json()["id"]

        response = self.client.put(
            f"/api/posts/{post_id}",
            data=json.dumps({"game_hub_id": other_hub.id}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)


    def test_update_post_requires_authentication(self):
        post = Post.objects.create(
            game_hub=self.hub, author=self.user, title="Auth test", body="x",
            status=Post.Status.PUBLISHED,
        )
        response = self.client.put(
            f"/api/posts/{post.id}",
            data=json.dumps({"title": "Hacked"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)

    def test_update_nonexistent_post_returns_404(self):
        self._login()
        response = self.client.put(
            "/api/posts/99999",
            data=json.dumps({"title": "Ghost"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

    def test_delete_post_requires_authentication(self):
        post = Post.objects.create(
            game_hub=self.hub, author=self.user, title="Auth delete", body="x",
            status=Post.Status.PUBLISHED,
        )
        response = self.client.delete(f"/api/posts/{post.id}")
        self.assertEqual(response.status_code, 401)

    def test_delete_nonexistent_post_returns_404(self):
        self._login()
        response = self.client.delete("/api/posts/99999")
        self.assertEqual(response.status_code, 404)

    def test_get_nonexistent_post_returns_404(self):
        response = self.client.get("/api/posts/99999")
        self.assertEqual(response.status_code, 404)

    def test_get_draft_post_returns_200(self):
        # Draft posts are visible via direct GET (only DELETED triggers 404)
        draft = Post.objects.create(
            game_hub=self.hub, author=self.user, title="Draft preview", body="wip",
            status=Post.Status.DRAFT,
        )
        response = self.client.get(f"/api/posts/{draft.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "draft")


class PostVoteApiTests(TestCase):
    def setUp(self):
        self.author = User.objects.create_user(
            username="author", password="pass-123", email="author@example.com"
        )
        self.voter = User.objects.create_user(
            username="voter", password="pass-456", email="voter@example.com"
        )
        self.other_voter = User.objects.create_user(
            username="other-voter", password="pass-789", email="other@example.com"
        )
        self.hub = GameHub.objects.create(name="Helldivers Hub", slug="helldivers-hub")
        self.post = Post.objects.create(
            game_hub=self.hub,
            author=self.author,
            title="Patch notes reaction",
            body="Balance changes are wild.",
            status=Post.Status.PUBLISHED,
        )

    def _login(self, username="voter", password="pass-456"):
        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": username, "password": password}),
            content_type="application/json",
        )

    def test_vote_requires_authentication(self):
        response = self.client.put(
            f"/api/posts/{self.post.id}/vote",
            data=json.dumps({"value": 1}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)

    def test_upvote_returns_updated_summary(self):
        self._login()
        response = self.client.put(
            f"/api/posts/{self.post.id}/vote",
            data=json.dumps({"value": 1}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["vote_score"], 1)
        self.assertEqual(response.json()["upvote_count"], 1)
        self.assertEqual(response.json()["downvote_count"], 0)
        self.assertEqual(response.json()["current_user_vote"], 1)
        self.assertTrue(
            PostVote.objects.filter(post=self.post, user=self.voter, value=1).exists()
        )

    def test_clearing_vote_sets_score_back_to_zero(self):
        PostVote.objects.create(post=self.post, user=self.voter, value=1)

        self._login()
        response = self.client.put(
            f"/api/posts/{self.post.id}/vote",
            data=json.dumps({"value": 0}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["vote_score"], 0)
        self.assertEqual(response.json()["current_user_vote"], 0)
        self.assertFalse(PostVote.objects.filter(post=self.post, user=self.voter).exists())

    def test_switching_vote_replaces_existing_vote(self):
        PostVote.objects.create(post=self.post, user=self.voter, value=1)

        self._login()
        response = self.client.put(
            f"/api/posts/{self.post.id}/vote",
            data=json.dumps({"value": -1}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["vote_score"], -1)
        self.assertEqual(response.json()["upvote_count"], 0)
        self.assertEqual(response.json()["downvote_count"], 1)
        self.assertEqual(response.json()["current_user_vote"], -1)
        self.assertEqual(
            PostVote.objects.get(post=self.post, user=self.voter).value,
            -1,
        )

    def test_post_endpoints_include_vote_summary(self):
        PostVote.objects.create(post=self.post, user=self.voter, value=1)
        PostVote.objects.create(post=self.post, user=self.other_voter, value=-1)

        self._login()
        detail_response = self.client.get(f"/api/posts/{self.post.id}")
        list_response = self.client.get("/api/posts")

        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.json()["vote_score"], 0)
        self.assertEqual(detail_response.json()["current_user_vote"], 1)

        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.json()[0]["vote_score"], 0)
        self.assertEqual(list_response.json()[0]["upvote_count"], 1)
        self.assertEqual(list_response.json()[0]["downvote_count"], 1)
        self.assertEqual(list_response.json()[0]["current_user_vote"], 1)

    def test_cannot_vote_on_non_published_post(self):
        draft_post = Post.objects.create(
            game_hub=self.hub,
            author=self.author,
            title="Draft",
            body="Still editing",
            status=Post.Status.DRAFT,
        )
        self._login()

        response = self.client.put(
            f"/api/posts/{draft_post.id}/vote",
            data=json.dumps({"value": 1}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 404)


class PostCommentApiTests(TestCase):
    def setUp(self):
        self.author = User.objects.create_user(
            username="author", password="pass-123", email="author@example.com"
        )
        self.commenter = User.objects.create_user(
            username="commenter", password="pass-456", email="commenter@example.com"
        )
        self.hub = GameHub.objects.create(name="Elden Hub", slug="elden-hub")
        self.post = Post.objects.create(
            game_hub=self.hub,
            author=self.author,
            title="Best faith build",
            body="Share your setup.",
            status=Post.Status.PUBLISHED,
        )

    def _login(self):
        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": "commenter", "password": "pass-456"}),
            content_type="application/json",
        )

    def test_list_comments_returns_public_comment_thread(self):
        PostComment.objects.create(post=self.post, author=self.commenter, body="Try dual seals.")

        response = self.client.get(f"/api/posts/{self.post.id}/comments")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["author"]["username"], "commenter")
        self.assertEqual(response.json()[0]["body"], "Try dual seals.")

    def test_create_comment_requires_authentication(self):
        response = self.client.post(
            f"/api/posts/{self.post.id}/comments",
            data={"body": "Looks strong."},
        )

        self.assertEqual(response.status_code, 401)

    def test_create_comment_on_published_post(self):
        self._login()

        response = self.client.post(
            f"/api/posts/{self.post.id}/comments",
            data={"body": "This setup carried me through the final bosses."},
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["body"], "This setup carried me through the final bosses.")
        self.assertEqual(response.json()["author"]["username"], "commenter")
        self.assertTrue(
            PostComment.objects.filter(post=self.post, author=self.commenter).exists()
        )

    def test_create_comment_rejects_blank_body(self):
        self._login()

        response = self.client.post(
            f"/api/posts/{self.post.id}/comments",
            data={"body": "   "},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "Comment text is required")

    def test_create_comment_with_attachment(self):
        self._login()
        attachment = SimpleUploadedFile(
            "route-notes.txt",
            b"farm runes at the palace approach",
            content_type="text/plain",
        )

        response = self.client.post(
            f"/api/posts/{self.post.id}/comments",
            data={"body": "Attached my farming route.", "attachment": attachment},
        )

        self.assertEqual(response.status_code, 201)
        self.assertRegex(response.json()["attachment_name"], r"^route-notes.*\.txt$")
        self.assertIn("/media/comment_attachments/route-notes", response.json()["attachment_url"])

    def test_posts_include_comment_count(self):
        PostComment.objects.create(post=self.post, author=self.commenter, body="One")
        PostComment.objects.create(post=self.post, author=self.author, body="Two")

        response = self.client.get("/api/posts")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["comment_count"], 2)

    def test_cannot_comment_on_draft_post(self):
        draft_post = Post.objects.create(
            game_hub=self.hub,
            author=self.author,
            title="Draft",
            body="Still editing",
            status=Post.Status.DRAFT,
        )
        self._login()

        response = self.client.post(
            f"/api/posts/{draft_post.id}/comments",
            data={"body": "Looks good."},
        )

        self.assertEqual(response.status_code, 404)


    def test_list_comments_on_deleted_post_returns_404(self):
        deleted_post = Post.objects.create(
            game_hub=self.hub, author=self.author, title="Deleted",
            body="Gone", status=Post.Status.DELETED,
        )
        response = self.client.get(f"/api/posts/{deleted_post.id}/comments")
        self.assertEqual(response.status_code, 404)

    def test_list_comments_on_nonexistent_post_returns_404(self):
        response = self.client.get("/api/posts/99999/comments")
        self.assertEqual(response.status_code, 404)

    def test_create_comment_on_deleted_post_returns_404(self):
        deleted_post = Post.objects.create(
            game_hub=self.hub, author=self.author, title="Removed",
            body="Gone", status=Post.Status.DELETED,
        )
        self._login()
        response = self.client.post(
            f"/api/posts/{deleted_post.id}/comments",
            data={"body": "Still here?"},
        )
        self.assertEqual(response.status_code, 404)


class PostModerationApiTests(TestCase):
    def setUp(self):
        self.author = User.objects.create_user(
            username="author",
            password="author-pass-123",
            email="author@example.com",
        )
        self.reporter = User.objects.create_user(
            username="reporter",
            password="report-pass-123",
            email="reporter@example.com",
        )
        self.moderator = User.objects.create_user(
            username="moderator",
            password="mod-pass-123",
            email="moderator@example.com",
        )
        self.moderator.profile.role = UserProfile.Role.MODERATOR
        self.moderator.profile.save()

        self.admin_user = User.objects.create_user(
            username="adminqueue",
            password="admin-pass-123",
            email="adminqueue@example.com",
        )
        self.admin_user.profile.role = UserProfile.Role.ADMIN
        self.admin_user.profile.save()

        self.hub = GameHub.objects.create(name="Mario Hub", slug="mario-hub")
        self.post = Post.objects.create(
            game_hub=self.hub,
            author=self.author,
            title="Unmarked secret route guide",
            body="This post reveals late-game shortcuts.",
            status=Post.Status.PUBLISHED,
            has_spoilers=True,
        )

    def _login(self, username, password):
        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": username, "password": password}),
            content_type="application/json",
        )

    def test_report_post_requires_authentication(self):
        response = self.client.post(
            f"/api/posts/{self.post.id}/reports",
            data=json.dumps({"reason": "Missing spoiler warning"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 401)

    def test_authenticated_user_can_report_post(self):
        self._login("reporter", "report-pass-123")

        response = self.client.post(
            f"/api/posts/{self.post.id}/reports",
            data=json.dumps({"reason": "Missing spoiler warning"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["status"], PostModerationReport.Status.OPEN)
        self.assertEqual(response.json()["reporter"]["username"], "reporter")
        self.assertTrue(
            PostModerationReport.objects.filter(post=self.post, reporter=self.reporter).exists()
        )
        self.assertEqual(Notification.objects.count(), 0)

    def test_user_cannot_report_own_post(self):
        self._login("author", "author-pass-123")

        response = self.client.post(
            f"/api/posts/{self.post.id}/reports",
            data=json.dumps({"reason": "Trying to self-report"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"], "You cannot report your own post")

    def test_duplicate_active_report_is_rejected(self):
        PostModerationReport.objects.create(
            post=self.post,
            reporter=self.reporter,
            reason="Already reported",
        )
        self._login("reporter", "report-pass-123")

        response = self.client.post(
            f"/api/posts/{self.post.id}/reports",
            data=json.dumps({"reason": "Still bad"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"], "You already have an active report for this post")

    def test_queue_requires_moderation_access(self):
        PostModerationReport.objects.create(
            post=self.post,
            reporter=self.reporter,
            reason="Missing spoiler warning",
        )
        self._login("reporter", "report-pass-123")

        response = self.client.get("/api/moderation/queue")

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"], "Moderator access required")

    def test_moderator_can_view_flagged_queue(self):
        PostModerationReport.objects.create(
            post=self.post,
            reporter=self.reporter,
            reason="Missing spoiler warning",
        )
        self._login("moderator", "mod-pass-123")

        response = self.client.get("/api/moderation/queue")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["id"], self.post.id)
        self.assertEqual(response.json()[0]["report_count"], 1)
        self.assertEqual(response.json()[0]["report_status"], PostModerationReport.Status.OPEN)
        self.assertEqual(response.json()[0]["latest_report_reason"], "Missing spoiler warning")

    def test_queue_filters_return_current_status_buckets(self):
        statuses = [
            PostModerationReport.Status.OPEN,
            PostModerationReport.Status.ESCALATED,
            PostModerationReport.Status.ACTIONED,
            PostModerationReport.Status.DISMISSED,
        ]
        posts_by_status = {}
        base_time = timezone.now()

        for index, status in enumerate(statuses):
            post = Post.objects.create(
                game_hub=self.hub,
                author=self.author,
                title=f"{status} queue post",
                body=f"{status} queue body",
                status=Post.Status.PUBLISHED,
            )
            report = PostModerationReport.objects.create(
                post=post,
                reporter=self.reporter,
                reason=f"{status} report",
                status=status,
            )
            PostModerationReport.objects.filter(id=report.id).update(
                created_at=base_time + timedelta(minutes=index)
            )
            posts_by_status[status] = post

        self._login("moderator", "mod-pass-123")

        for status, expected_post in posts_by_status.items():
            response = self.client.get(f"/api/moderation/queue?status={status}")

            self.assertEqual(response.status_code, 200)
            items = response.json()
            self.assertEqual({item["id"] for item in items}, {expected_post.id})
            self.assertTrue(all(item["report_status"] == status for item in items))

        all_response = self.client.get("/api/moderation/queue?status=all")
        self.assertEqual(all_response.status_code, 200)
        self.assertEqual(
            {item["id"] for item in all_response.json()},
            {post.id for post in posts_by_status.values()},
        )

    def test_queue_filter_uses_latest_report_status_for_posts_with_old_reports(self):
        base_time = timezone.now()
        old_report = PostModerationReport.objects.create(
            post=self.post,
            reporter=self.reporter,
            reason="Old resolved report",
            status=PostModerationReport.Status.ACTIONED,
        )
        new_report = PostModerationReport.objects.create(
            post=self.post,
            reporter=self.reporter,
            reason="Fresh report after prior action",
            status=PostModerationReport.Status.OPEN,
        )
        PostModerationReport.objects.filter(id=old_report.id).update(created_at=base_time)
        PostModerationReport.objects.filter(id=new_report.id).update(
            created_at=base_time + timedelta(minutes=1)
        )
        self._login("moderator", "mod-pass-123")

        open_response = self.client.get("/api/moderation/queue?status=open")
        actioned_response = self.client.get("/api/moderation/queue?status=actioned")

        self.assertEqual(open_response.status_code, 200)
        self.assertEqual(actioned_response.status_code, 200)
        self.assertEqual(len(open_response.json()), 1)
        self.assertEqual(open_response.json()[0]["id"], self.post.id)
        self.assertEqual(open_response.json()[0]["report_status"], PostModerationReport.Status.OPEN)
        self.assertEqual(open_response.json()[0]["latest_report_reason"], "Fresh report after prior action")
        self.assertEqual(open_response.json()[0]["report_count"], 2)
        self.assertEqual(actioned_response.json(), [])

    def test_warn_action_resolves_open_reports(self):
        PostModerationReport.objects.create(
            post=self.post,
            reporter=self.reporter,
            reason="Missing spoiler warning",
        )
        self._login("moderator", "mod-pass-123")

        response = self.client.post(
            f"/api/moderation/posts/{self.post.id}/actions",
            data=json.dumps({"action": "warn", "note": "Added moderator warning"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        report = PostModerationReport.objects.get(post=self.post, reporter=self.reporter)
        self.post.refresh_from_db()
        self.assertEqual(report.status, PostModerationReport.Status.ACTIONED)
        self.assertEqual(self.post.status, Post.Status.PUBLISHED)
        self.assertEqual(response.json()["report_status"], PostModerationReport.Status.ACTIONED)
        self.assertEqual(response.json()["latest_action"], PostModerationAction.Action.WARN)

        notification = Notification.objects.get(recipient=self.author)
        self.assertEqual(notification.type, Notification.Type.MODERATION_WARNING)
        self.assertEqual(notification.actor, self.moderator)
        self.assertEqual(notification.post, self.post)
        self.assertEqual(notification.moderation_action.action, PostModerationAction.Action.WARN)
        self.assertIn("Added moderator warning", notification.message)

    def test_author_session_sees_warn_and_remove_notifications_without_relogin(self):
        warning_report = PostModerationReport.objects.create(
            post=self.post,
            reporter=self.reporter,
            reason="Missing spoiler warning",
        )
        removal_post = Post.objects.create(
            game_hub=self.hub,
            author=self.author,
            title="Spam strategy repost",
            body="Repeated spam content.",
            status=Post.Status.PUBLISHED,
        )
        PostModerationReport.objects.create(
            post=removal_post,
            reporter=self.reporter,
            reason="Spam repost",
        )
        author_client = Client()
        moderator_client = Client()
        author_client.post(
            "/api/auth/login",
            data=json.dumps({"username": "author", "password": "author-pass-123"}),
            content_type="application/json",
        )
        moderator_client.post(
            "/api/auth/login",
            data=json.dumps({"username": "moderator", "password": "mod-pass-123"}),
            content_type="application/json",
        )

        before_response = author_client.get("/api/notifications")
        self.assertEqual(before_response.status_code, 200)
        self.assertEqual(before_response.json(), [])

        warn_response = moderator_client.post(
            f"/api/moderation/posts/{self.post.id}/actions",
            data=json.dumps({"action": "warn", "note": "Visible warning note"}),
            content_type="application/json",
        )
        after_warn_response = author_client.get("/api/notifications")

        self.assertEqual(warn_response.status_code, 200)
        warning_report.refresh_from_db()
        self.assertEqual(warning_report.status, PostModerationReport.Status.ACTIONED)
        self.assertEqual(after_warn_response.status_code, 200)
        self.assertEqual(len(after_warn_response.json()), 1)
        self.assertEqual(
            after_warn_response.json()[0]["type"],
            Notification.Type.MODERATION_WARNING,
        )
        self.assertIn("Visible warning note", after_warn_response.json()[0]["message"])

        remove_response = moderator_client.post(
            f"/api/moderation/posts/{removal_post.id}/actions",
            data=json.dumps({"action": "remove", "note": "Visible removal note"}),
            content_type="application/json",
        )
        after_remove_response = author_client.get("/api/notifications")

        self.assertEqual(remove_response.status_code, 200)
        removal_post.refresh_from_db()
        self.assertEqual(removal_post.status, Post.Status.DELETED)
        self.assertEqual(after_remove_response.status_code, 200)
        self.assertEqual(len(after_remove_response.json()), 2)
        notification_types = {
            notification["type"] for notification in after_remove_response.json()
        }
        self.assertEqual(
            notification_types,
            {
                Notification.Type.MODERATION_WARNING,
                Notification.Type.POST_REMOVED,
            },
        )
        self.assertTrue(
            any(
                "Visible removal note" in notification["message"]
                for notification in after_remove_response.json()
            )
        )

    def test_retried_warn_action_does_not_create_duplicate_notification(self):
        PostModerationReport.objects.create(
            post=self.post,
            reporter=self.reporter,
            reason="Missing spoiler warning",
        )
        self._login("moderator", "mod-pass-123")

        first_response = self.client.post(
            f"/api/moderation/posts/{self.post.id}/actions",
            data=json.dumps({"action": "warn", "note": "Added moderator warning"}),
            content_type="application/json",
        )
        retry_response = self.client.post(
            f"/api/moderation/posts/{self.post.id}/actions",
            data=json.dumps({"action": "warn", "note": "Added moderator warning"}),
            content_type="application/json",
        )

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(retry_response.status_code, 409)
        self.assertEqual(Notification.objects.filter(recipient=self.author).count(), 1)

    def test_escalate_action_marks_reports_escalated(self):
        PostModerationReport.objects.create(
            post=self.post,
            reporter=self.reporter,
            reason="Repeat bait title",
        )
        self._login("moderator", "mod-pass-123")

        response = self.client.post(
            f"/api/moderation/posts/{self.post.id}/actions",
            data=json.dumps({"action": "escalate", "note": "Needs admin review"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        report = PostModerationReport.objects.get(post=self.post, reporter=self.reporter)
        self.assertEqual(report.status, PostModerationReport.Status.ESCALATED)
        self.assertEqual(response.json()["report_status"], PostModerationReport.Status.ESCALATED)
        self.assertEqual(response.json()["latest_action"], PostModerationAction.Action.ESCALATE)
        self.assertEqual(Notification.objects.count(), 0)

    def test_remove_action_soft_deletes_post(self):
        PostModerationReport.objects.create(
            post=self.post,
            reporter=self.reporter,
            reason="Spam repost",
        )
        self._login("moderator", "mod-pass-123")

        response = self.client.post(
            f"/api/moderation/posts/{self.post.id}/actions",
            data=json.dumps({"action": "remove", "note": "Removed from public feed"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        report = PostModerationReport.objects.get(post=self.post, reporter=self.reporter)
        self.post.refresh_from_db()
        self.assertEqual(report.status, PostModerationReport.Status.ACTIONED)
        self.assertEqual(self.post.status, Post.Status.DELETED)
        self.assertEqual(response.json()["report_status"], PostModerationReport.Status.ACTIONED)
        self.assertEqual(response.json()["latest_action"], PostModerationAction.Action.REMOVE)

        notification = Notification.objects.get(recipient=self.author)
        self.assertEqual(notification.type, Notification.Type.POST_REMOVED)
        self.assertEqual(notification.actor, self.moderator)
        self.assertEqual(notification.post, self.post)
        self.assertEqual(notification.post.status, Post.Status.DELETED)
        self.assertIn("Removed from public feed", notification.message)

    def test_dismiss_action_clears_report_without_deleting_post(self):
        PostModerationReport.objects.create(
            post=self.post,
            reporter=self.reporter,
            reason="False alarm",
        )
        self._login("moderator", "mod-pass-123")

        response = self.client.post(
            f"/api/moderation/posts/{self.post.id}/actions",
            data=json.dumps({"action": "dismiss", "note": "No issue found"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        report = PostModerationReport.objects.get(post=self.post, reporter=self.reporter)
        self.post.refresh_from_db()
        self.assertEqual(report.status, PostModerationReport.Status.DISMISSED)
        self.assertEqual(self.post.status, Post.Status.PUBLISHED)
        self.assertEqual(response.json()["report_status"], PostModerationReport.Status.DISMISSED)
        self.assertEqual(response.json()["latest_action"], PostModerationAction.Action.DISMISS)
        self.assertEqual(Notification.objects.count(), 0)

    def test_notification_list_requires_authentication(self):
        response = self.client.get("/api/notifications")

        self.assertEqual(response.status_code, 401)

    def test_notification_list_returns_only_current_user_notifications(self):
        own_notification = Notification.objects.create(
            recipient=self.author,
            actor=self.moderator,
            post=self.post,
            type=Notification.Type.MODERATION_WARNING,
            title="Moderator warning",
            message="Your post received a warning.",
        )
        Notification.objects.create(
            recipient=self.reporter,
            actor=self.moderator,
            post=self.post,
            type=Notification.Type.POST_REMOVED,
            title="Post removed",
            message="Another user's notification.",
        )
        self._login("author", "author-pass-123")

        response = self.client.get("/api/notifications")

        self.assertEqual(response.status_code, 200)
        notifications = response.json()
        self.assertEqual(len(notifications), 1)
        self.assertEqual(notifications[0]["id"], own_notification.id)
        self.assertEqual(notifications[0]["type"], Notification.Type.MODERATION_WARNING)
        self.assertEqual(notifications[0]["actor_username"], "moderator")
        self.assertEqual(notifications[0]["post_id"], self.post.id)
        self.assertEqual(notifications[0]["post_title"], self.post.title)
        self.assertEqual(notifications[0]["post_status"], Post.Status.PUBLISHED)
        self.assertIn("created_at", notifications[0])

    def test_user_can_mark_own_notification_read(self):
        notification = Notification.objects.create(
            recipient=self.author,
            actor=self.moderator,
            post=self.post,
            type=Notification.Type.MODERATION_WARNING,
            title="Moderator warning",
            message="Your post received a warning.",
        )
        self._login("author", "author-pass-123")

        response = self.client.post(f"/api/notifications/{notification.id}/read")

        self.assertEqual(response.status_code, 200)
        notification.refresh_from_db()
        self.assertTrue(notification.is_read)
        self.assertTrue(response.json()["is_read"])

    def test_user_cannot_mark_another_users_notification_read(self):
        notification = Notification.objects.create(
            recipient=self.reporter,
            actor=self.moderator,
            post=self.post,
            type=Notification.Type.POST_REMOVED,
            title="Post removed",
            message="Another user's notification.",
        )
        self._login("author", "author-pass-123")

        response = self.client.post(f"/api/notifications/{notification.id}/read")

        self.assertEqual(response.status_code, 404)
        notification.refresh_from_db()
        self.assertFalse(notification.is_read)

    # ── Moderation queue auth/access ──────────────────────────

    def test_moderation_queue_requires_authentication(self):
        response = self.client.get("/api/moderation/queue")
        self.assertEqual(response.status_code, 401)

    def test_admin_can_access_moderation_queue(self):
        PostModerationReport.objects.create(
            post=self.post, reporter=self.reporter, reason="Admin queue test"
        )
        self._login("adminqueue", "admin-pass-123")
        response = self.client.get("/api/moderation/queue")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)

    # ── Moderation actions auth/access ────────────────────────

    def test_moderate_post_requires_authentication(self):
        response = self.client.post(
            f"/api/moderation/posts/{self.post.id}/actions",
            data=json.dumps({"action": "warn", "note": ""}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)

    def test_non_moderator_cannot_take_moderation_action(self):
        PostModerationReport.objects.create(
            post=self.post, reporter=self.reporter, reason="Test"
        )
        self._login("reporter", "report-pass-123")
        response = self.client.post(
            f"/api/moderation/posts/{self.post.id}/actions",
            data=json.dumps({"action": "warn", "note": ""}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)

    def test_moderate_nonexistent_post_returns_404(self):
        self._login("moderator", "mod-pass-123")
        response = self.client.post(
            "/api/moderation/posts/99999/actions",
            data=json.dumps({"action": "warn", "note": ""}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

    def test_moderate_post_with_no_active_reports_returns_409(self):
        # Post exists but has no reports
        unreported_post = Post.objects.create(
            game_hub=self.hub, author=self.author,
            title="Clean post", body="No complaints.",
            status=Post.Status.PUBLISHED,
        )
        self._login("moderator", "mod-pass-123")
        response = self.client.post(
            f"/api/moderation/posts/{unreported_post.id}/actions",
            data=json.dumps({"action": "warn", "note": ""}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"], "No active moderation reports for this post")

    # ── Report validation ─────────────────────────────────────

    def test_report_post_with_empty_reason_returns_400(self):
        self._login("reporter", "report-pass-123")
        response = self.client.post(
            f"/api/posts/{self.post.id}/reports",
            data=json.dumps({"reason": "   "}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "Report reason is required")

    # ── Notification auth ─────────────────────────────────────

    def test_mark_notification_read_requires_authentication(self):
        notification = Notification.objects.create(
            recipient=self.author, actor=self.moderator, post=self.post,
            type=Notification.Type.MODERATION_WARNING,
            title="Warning", message="Test.",
        )
        response = self.client.post(f"/api/notifications/{notification.id}/read")
        self.assertEqual(response.status_code, 401)

    def test_mark_nonexistent_notification_read_returns_404(self):
        self._login("author", "author-pass-123")
        response = self.client.post("/api/notifications/99999/read")
        self.assertEqual(response.status_code, 404)


class EmailVerificationApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="unverified",
            password="pass-123",
            email="unverified@example.com",
        )
        # profile.email_verified defaults to False

    def _make_token(self, expired=False, used=False):
        expiry = timezone.now() + timedelta(hours=24)
        if expired:
            expiry = timezone.now() - timedelta(hours=1)
        token_obj = EmailVerificationToken.objects.create(
            user=self.user,
            token="test-token-abc123",
            expires_at=expiry,
        )
        if used:
            token_obj.used_at = timezone.now()
            token_obj.save(update_fields=["used_at"])
        return token_obj

    def test_verify_email_with_valid_token(self):
        self._make_token()
        response = self.client.post(
            "/api/auth/verify-email",
            data=json.dumps({"token": "test-token-abc123"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], "Email verified successfully")
        self.user.profile.refresh_from_db()
        self.assertTrue(self.user.profile.email_verified)

    def test_verify_email_marks_token_as_used(self):
        token_obj = self._make_token()
        self.client.post(
            "/api/auth/verify-email",
            data=json.dumps({"token": "test-token-abc123"}),
            content_type="application/json",
        )
        token_obj.refresh_from_db()
        self.assertIsNotNone(token_obj.used_at)

    def test_verify_email_with_invalid_token_returns_400(self):
        response = self.client.post(
            "/api/auth/verify-email",
            data=json.dumps({"token": "not-a-real-token"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "Invalid verification token")

    def test_verify_email_with_expired_token_returns_400(self):
        self._make_token(expired=True)
        response = self.client.post(
            "/api/auth/verify-email",
            data=json.dumps({"token": "test-token-abc123"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("expired", response.json()["error"].lower())

    def test_verify_email_with_already_used_token_returns_409(self):
        self._make_token(used=True)
        response = self.client.post(
            "/api/auth/verify-email",
            data=json.dumps({"token": "test-token-abc123"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"], "This token has already been used")

    def test_resend_verification_requires_authentication(self):
        response = self.client.post("/api/auth/resend-verification")
        self.assertEqual(response.status_code, 401)

    def test_resend_verification_for_unverified_user_returns_200(self):
        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": "unverified", "password": "pass-123"}),
            content_type="application/json",
        )
        response = self.client.post("/api/auth/resend-verification")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["message"], "Verification email sent")
        self.assertTrue(EmailVerificationToken.objects.filter(user=self.user).exists())

    def test_resend_verification_for_already_verified_user_returns_409(self):
        self.user.profile.email_verified = True
        self.user.profile.save()
        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": "unverified", "password": "pass-123"}),
            content_type="application/json",
        )
        response = self.client.post("/api/auth/resend-verification")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"], "Email is already verified")


class DeveloperFeedbackApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="player", password="pass-123", email="player@example.com"
        )
        self.developer = User.objects.create_user(
            username="devuser", password="dev-pass-123", email="dev@example.com"
        )
        self.developer.profile.role = UserProfile.Role.DEVELOPER
        self.developer.profile.save()

        self.hub = GameHub.objects.create(name="Hollow Hub", slug="hollow-hub")
        self.hub.developers.add(self.developer)

    def _login(self, username="player", password="pass-123"):
        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": username, "password": password}),
            content_type="application/json",
        )

    def test_submit_feedback_requires_authentication(self):
        response = self.client.post(
            f"/api/gamehubs/{self.hub.id}/feedback",
            data=json.dumps({"message": "Great game!"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)

    def test_user_can_submit_feedback_to_hub(self):
        self._login()
        response = self.client.post(
            f"/api/gamehubs/{self.hub.id}/feedback",
            data=json.dumps({"message": "Love the lore updates."}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["from_username"], "player")
        self.assertEqual(response.json()["game_hub"]["id"], self.hub.id)
        self.assertTrue(
            DeveloperFeedback.objects.filter(from_user=self.user, game_hub=self.hub).exists()
        )

    def test_developer_cannot_submit_feedback_to_own_hub(self):
        self._login("devuser", "dev-pass-123")
        response = self.client.post(
            f"/api/gamehubs/{self.hub.id}/feedback",
            data=json.dumps({"message": "Self-feedback attempt"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"], "You cannot submit feedback to a hub you develop")

    def test_submit_feedback_to_nonexistent_hub_returns_404(self):
        self._login()
        response = self.client.post(
            "/api/gamehubs/99999/feedback",
            data=json.dumps({"message": "Ghost hub"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

    def test_submit_feedback_with_empty_message_returns_400(self):
        self._login()
        response = self.client.post(
            f"/api/gamehubs/{self.hub.id}/feedback",
            data=json.dumps({"message": "   "}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "Message is required")

    def test_submit_feedback_message_too_long_returns_400(self):
        self._login()
        response = self.client.post(
            f"/api/gamehubs/{self.hub.id}/feedback",
            data=json.dumps({"message": "x" * (DeveloperFeedback.MAX_MESSAGE_LENGTH + 1)}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("cannot exceed", response.json()["error"])

    def test_feedback_cooldown_prevents_rapid_resubmit(self):
        self._login()
        self.client.post(
            f"/api/gamehubs/{self.hub.id}/feedback",
            data=json.dumps({"message": "First message"}),
            content_type="application/json",
        )
        response = self.client.post(
            f"/api/gamehubs/{self.hub.id}/feedback",
            data=json.dumps({"message": "Second message immediately after"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 429)
        self.assertIn("wait", response.json()["error"].lower())


class DeveloperPortalApiTests(TestCase):
    def setUp(self):
        self.developer = User.objects.create_user(
            username="portaldev", password="dev-pass-123", email="portaldev@example.com"
        )
        self.developer.profile.role = UserProfile.Role.DEVELOPER
        self.developer.profile.save()

        self.contributor = User.objects.create_user(
            username="contrib", password="contrib-pass-123", email="contrib@example.com"
        )

        self.hub = GameHub.objects.create(name="Portal Hub", slug="portal-hub")
        self.other_hub = GameHub.objects.create(name="Other Hub", slug="other-hub")
        self.hub.developers.add(self.developer)

        self.feedback1 = DeveloperFeedback.objects.create(
            game_hub=self.hub, from_user=self.contributor, message="First feedback"
        )
        self.feedback2 = DeveloperFeedback.objects.create(
            game_hub=self.hub, from_user=self.contributor, message="Second feedback"
        )

    def _login_dev(self):
        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": "portaldev", "password": "dev-pass-123"}),
            content_type="application/json",
        )

    def _login_contrib(self):
        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": "contrib", "password": "contrib-pass-123"}),
            content_type="application/json",
        )

    # ── GET /developer/gamehubs ───────────────────────────────

    def test_list_developer_gamehubs_requires_authentication(self):
        response = self.client.get("/api/developer/gamehubs")
        self.assertEqual(response.status_code, 401)

    def test_non_developer_cannot_list_developer_gamehubs(self):
        self._login_contrib()
        response = self.client.get("/api/developer/gamehubs")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"], "Developer access required")

    def test_developer_can_list_assigned_hubs(self):
        self._login_dev()
        response = self.client.get("/api/developer/gamehubs")
        self.assertEqual(response.status_code, 200)
        hub_ids = [h["id"] for h in response.json()]
        self.assertIn(self.hub.id, hub_ids)
        self.assertNotIn(self.other_hub.id, hub_ids)

    # ── GET /developer/feedback ───────────────────────────────

    def test_list_developer_feedback_requires_authentication(self):
        response = self.client.get("/api/developer/feedback")
        self.assertEqual(response.status_code, 401)

    def test_non_developer_cannot_list_developer_feedback(self):
        self._login_contrib()
        response = self.client.get("/api/developer/feedback")
        self.assertEqual(response.status_code, 403)

    def test_developer_can_list_all_feedback(self):
        self._login_dev()
        response = self.client.get("/api/developer/feedback")
        self.assertEqual(response.status_code, 200)
        ids = [f["id"] for f in response.json()]
        self.assertIn(self.feedback1.id, ids)
        self.assertIn(self.feedback2.id, ids)

    def test_developer_feedback_filtered_by_hub_id(self):
        # feedback for other_hub should not appear
        other_feedback = DeveloperFeedback.objects.create(
            game_hub=self.other_hub, from_user=self.contributor, message="Wrong hub"
        )
        self._login_dev()
        response = self.client.get(f"/api/developer/feedback?game_hub_id={self.hub.id}")
        self.assertEqual(response.status_code, 200)
        ids = [f["id"] for f in response.json()]
        self.assertIn(self.feedback1.id, ids)
        self.assertNotIn(other_feedback.id, ids)

    def test_developer_feedback_filter_by_unassigned_hub_returns_empty(self):
        self._login_dev()
        response = self.client.get(f"/api/developer/feedback?game_hub_id={self.other_hub.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_developer_feedback_invalid_date_from_returns_400(self):
        self._login_dev()
        response = self.client.get("/api/developer/feedback?date_from=not-a-date")
        self.assertEqual(response.status_code, 400)
        self.assertIn("date_from", response.json()["error"])

    def test_developer_feedback_invalid_date_to_returns_400(self):
        self._login_dev()
        response = self.client.get("/api/developer/feedback?date_to=31-12-2025")
        self.assertEqual(response.status_code, 400)
        self.assertIn("date_to", response.json()["error"])

    def test_developer_feedback_date_from_after_date_to_returns_400(self):
        self._login_dev()
        response = self.client.get(
            "/api/developer/feedback?date_from=2025-12-31&date_to=2025-01-01"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("date_from", response.json()["error"])

    def test_developer_feedback_filtered_by_date_from(self):
        # Set feedback1 far in the past and feedback2 in the future (relative to filter)
        DeveloperFeedback.objects.filter(id=self.feedback1.id).update(
            created_at=timezone.now() - timedelta(days=10)
        )
        DeveloperFeedback.objects.filter(id=self.feedback2.id).update(
            created_at=timezone.now()
        )
        self._login_dev()
        response = self.client.get("/api/developer/feedback?date_from=2099-01-01")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

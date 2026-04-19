import json

from django.contrib.auth.models import User
from django.conf import settings
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile

from .models import GameHub, ModeratorAccessRequest, Post, PostComment, PostVote, Tag, UserProfile


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
        self.assertEqual(response.json()["attachment_name"], "route-notes.txt")
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

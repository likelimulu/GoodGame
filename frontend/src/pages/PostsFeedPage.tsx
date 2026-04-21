import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import PostComments from "../components/PostComments";
import VoteControls from "../components/VoteControls";
import Spinner from "../components/Spinner";
import { api } from "../api/client";
import type {
  ApiMessage,
  ApiError,
  GameHub,
  Post,
  PostModerationReport,
  PostVoteSummary,
} from "../api/types";
import { useAuth } from "../context/useAuth";
import { useToast } from "../context/ToastContext";

function sortPosts(posts: Post[], mineOnly: boolean) {
  return [...posts].sort((a, b) => {
    if (mineOnly) {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    }
    if (b.vote_score !== a.vote_score) return b.vote_score - a.vote_score;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export default function PostsFeedPage({ mineOnly = false }: { mineOnly?: boolean }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const openCommentsByDefault = searchParams.get("comments") === "open";
  const { addToast } = useToast();

  const [gameHubs, setGameHubs] = useState<GameHub[]>([]);
  const [selectedHubId, setSelectedHubId] = useState("all");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPostId, setBusyPostId] = useState<number | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [reportingPostId, setReportingPostId] = useState<number | null>(null);
  const [openReportPostId, setOpenReportPostId] = useState<number | null>(null);
  const [reportReasons, setReportReasons] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const params = new URLSearchParams();
    if (selectedHubId !== "all") params.set("game_hub_id", selectedHubId);
    if (mineOnly) params.set("mine", "true");
    const postPath = params.size > 0 ? `/posts?${params.toString()}` : "/posts";

    Promise.all([
      api.get<GameHub[]>("/gamehubs", signal),
      api.get<Post[] | ApiError>(postPath, signal),
    ])
      .then(([gameHubResponse, postsResponse]) => {
        if (gameHubResponse.status === 200 && Array.isArray(gameHubResponse.data)) {
          setGameHubs(gameHubResponse.data);
        }
        if (postsResponse.status === 200 && Array.isArray(postsResponse.data)) {
          setPosts(sortPosts(postsResponse.data as Post[], mineOnly));
        } else {
          setError((postsResponse.data as ApiError).error ?? "Failed to load posts");
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError("Failed to load posts");
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [mineOnly, selectedHubId]);

  async function handleVote(post: Post, direction: 1 | -1) {
    if (!user) {
      navigate("/login");
      return;
    }

    const value = post.current_user_vote === direction ? 0 : direction;
    setBusyPostId(post.id);
    setError(null);

    const { status, data } = await api.put<PostVoteSummary | ApiError>(
      `/posts/${post.id}/vote`,
      { value },
    );
    setBusyPostId(null);

    if (status === 200) {
      const voteState = data as PostVoteSummary;
      setPosts((currentPosts) =>
        sortPosts(
          currentPosts.map((currentPost) =>
            currentPost.id === post.id
              ? { ...currentPost, ...voteState }
              : currentPost,
          ),
          mineOnly,
        ),
      );
      return;
    }

    if (status === 401) {
      navigate("/login");
      return;
    }

    const errMsg = (data as ApiError).error ?? "Failed to save vote";
    setError(errMsg);
    addToast(errMsg, "error");
  }

  async function handleDelete(post: Post) {
    setConfirmDeleteId(null);
    setDeletingPostId(post.id);
    setError(null);
    const { status, data } = await api.delete<ApiMessage | ApiError>(`/posts/${post.id}`);
    setDeletingPostId(null);

    if (status === 200) {
      setPosts((currentPosts) => currentPosts.filter((currentPost) => currentPost.id !== post.id));
      addToast("Post deleted", "success");
      return;
    }

    if (status === 401) {
      navigate("/login");
      return;
    }

    const errMsg = (data as ApiError).error ?? "Failed to delete post";
    setError(errMsg);
    addToast(errMsg, "error");
  }

  function handleCommentCreated(postId: number) {
    setPosts((currentPosts) =>
      currentPosts.map((currentPost) =>
        currentPost.id === postId
          ? { ...currentPost, comment_count: currentPost.comment_count + 1 }
          : currentPost,
      ),
    );
  }

  async function handleReport(post: Post) {
    if (!user) {
      navigate("/login");
      return;
    }

    const reason = reportReasons[post.id]?.trim() ?? "";
    if (!reason) {
      const message = "Report reason is required";
      setError(message);
      addToast(message, "error");
      return;
    }

    setReportingPostId(post.id);
    setError(null);

    const { status, data } = await api.post<PostModerationReport | ApiError>(
      `/posts/${post.id}/reports`,
      { reason },
    );

    setReportingPostId(null);

    if (status === 201) {
      setOpenReportPostId(null);
      setReportReasons((current) => {
        const next = { ...current };
        delete next[post.id];
        return next;
      });
      addToast("Post sent to the moderator queue", "success");
      return;
    }

    if (status === 401) {
      navigate("/login");
      return;
    }

    const errMsg = (data as ApiError).error ?? "Failed to submit report";
    setError(errMsg);
    addToast(errMsg, "error");
  }

  return (
    <Layout>
      <main className="page-grid feed-grid">
        <section className="hero-card">
          <span className="eyebrow">{mineOnly ? "Post Studio" : "Patch Feed"}</span>
          <h1 className="headline">{mineOnly ? "My Posts" : "Community Feed"}</h1>
          <p className="subhead">
            {mineOnly
              ? "Review your drafts and published threads, then edit or remove them when you need to."
              : "Browse published posts, push strong threads upward, and bury weak ones."}
          </p>

          <div className="feed-sidebar-stack">
            <div className="field">
              <label htmlFor="hub-filter">Game Hub</label>
              <select
                id="hub-filter"
                value={selectedHubId}
                onChange={(e) => {
                  setLoading(true);
                  setError(null);
                  setSelectedHubId(e.target.value);
                }}
              >
                <option value="all">All Hubs</option>
                {gameHubs.map((hub) => (
                  <option key={hub.id} value={hub.id}>
                    {hub.name}
                  </option>
                ))}
              </select>
            </div>

            {user ? (
              <Link
                className="btn primary"
                to={selectedHubId === "all" ? "/posts/create" : `/posts/create?hub=${selectedHubId}`}
              >
                {selectedHubId === "all"
                  ? mineOnly
                    ? "Create New Post"
                    : "Create Post"
                  : "Create In This Hub"}
              </Link>
            ) : (
              <Link className="btn primary" to="/login">
                Log In To Vote
              </Link>
            )}

            {user && !mineOnly && (
              <Link className="btn ghost" to="/my-posts">
                Manage My Posts
              </Link>
            )}

            <p className="helper">
              {user
                ? mineOnly
                  ? "Edit and delete stay here. Creating a new post returns you to this list instead of opening edit mode."
                  : selectedHubId === "all"
                    ? "Vote and comment directly from the feed. Click the same arrow again to clear your vote."
                    : "Voting updates the feed order live, comments stay attached to each post, and new posts open with this hub preselected."
                : "Sign in to vote, create posts, and edit your own threads."}
            </p>
          </div>
        </section>

        <section className="form-card feed-card">
          <p className="panel-tag">Live Threads</p>
          <h2 className="section-title">{mineOnly ? "Manage Threads" : "Top Discussions"}</h2>
          <p className="helper">
            {mineOnly
              ? "Your own posts are shown here so you can edit or delete them without mixing that flow into new post creation."
              : "Published posts are ranked by player votes, and each thread can collect comments with optional attachments."}
          </p>

          {error && <p className="form-error">{error}</p>}

          {loading ? (
            <div className="feed-empty-state">
              <Spinner text="Loading posts…" />
            </div>
          ) : posts.length === 0 ? (
            <div className="feed-empty-state">
              <h3 className="empty-title">{mineOnly ? "No posts yet" : "No posts yet"}</h3>
              <p className="helper">
                {mineOnly
                  ? "Create your first post and it will show up here for future edits or deletion."
                  : "Start the first thread in this hub and give other players something to react to."}
              </p>
            </div>
          ) : (
            <div className="feed-list">
              {posts.map((post) => (
                <article className="post-card" key={post.id}>
                  <VoteControls
                    vote_score={post.vote_score}
                    upvote_count={post.upvote_count}
                    downvote_count={post.downvote_count}
                    current_user_vote={post.current_user_vote}
                    busy={busyPostId === post.id}
                    onVote={(direction) => handleVote(post, direction)}
                  />

                  <div className="post-body">
                    <div className="post-meta">
                      <span className="post-hub">{post.game_hub.name}</span>
                      <span>by {post.author.username}</span>
                      <span>{new Date(post.created_at).toLocaleDateString()}</span>
                      {post.is_edited && <span>edited</span>}
                    </div>

                    <div className="post-badges">
                      {post.is_question && <span className="pill pill-question">Question</span>}
                      {post.has_spoilers && <span className="pill pill-warning">Spoilers</span>}
                    </div>

                    <h3 className="post-title">{post.title}</h3>
                    <p className="post-copy">{post.body}</p>

                    {post.tags.length > 0 && (
                      <div className="tag-row">
                        {post.tags.map((tag) => (
                          <span className="tag" key={tag.id}>
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="post-actions">
                      {mineOnly ? (
                        <>
                          <Link className="text-link" to={`/posts/${post.id}/edit`}>
                            Edit post
                          </Link>
                          {confirmDeleteId === post.id ? (
                            <span className="confirm-delete-inline">
                              <span className="confirm-delete-label">Delete this post?</span>
                              <button
                                className="btn-inline btn-inline-danger"
                                type="button"
                                onClick={() => handleDelete(post)}
                              >
                                Yes, delete
                              </button>
                              <button
                                className="btn-inline btn-inline-cancel"
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              className="action-link danger-link"
                              type="button"
                              onClick={() => setConfirmDeleteId(post.id)}
                              disabled={deletingPostId === post.id}
                            >
                              {deletingPostId === post.id ? "Deleting…" : "Delete post"}
                            </button>
                          )}
                        </>
                      ) : user?.id === post.author.id ? (
                        <Link className="text-link" to="/my-posts">
                          Manage in My Posts
                        </Link>
                      ) : (
                        <>
                          <span className="helper compact">
                            Vote, comment, or report a thread when it needs moderator attention.
                          </span>
                          <button
                            className="action-link text-link"
                            type="button"
                            onClick={() =>
                              setOpenReportPostId((current) =>
                                current === post.id ? null : post.id,
                              )
                            }
                          >
                            {openReportPostId === post.id ? "Hide report form" : "Report post"}
                          </button>
                        </>
                      )}
                    </div>

                    {!mineOnly &&
                    user &&
                    user.id !== post.author.id &&
                    openReportPostId === post.id ? (
                      <div className="report-panel">
                        <p className="report-title">Flag this post for moderator review</p>
                        <p className="helper compact">
                          Use this for spam, untagged spoilers, harassment, or other moderation
                          issues.
                        </p>
                        <div className="field">
                          <label htmlFor={`report-reason-${post.id}`}>Report Reason</label>
                          <textarea
                            id={`report-reason-${post.id}`}
                            rows={3}
                            placeholder="Tell moderators what needs review"
                            value={reportReasons[post.id] ?? ""}
                            onChange={(event) =>
                              setReportReasons((current) => ({
                                ...current,
                                [post.id]: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="report-actions">
                          <button
                            className="btn secondary"
                            type="button"
                            disabled={reportingPostId === post.id}
                            onClick={() => handleReport(post)}
                          >
                            {reportingPostId === post.id ? "Submitting…" : "Submit Report"}
                          </button>
                          <button
                            className="btn ghost"
                            type="button"
                            disabled={reportingPostId === post.id}
                            onClick={() => setOpenReportPostId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {!mineOnly && (
                      <PostComments
                        post={post}
                        canComment={Boolean(user)}
                        expandedByDefault={openCommentsByDefault}
                        onCommentCreated={() => handleCommentCreated(post.id)}
                      />
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </Layout>
  );
}

import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import PostComments from "../components/PostComments";
import Spinner from "../components/Spinner";
import VoteControls from "../components/VoteControls";
import { api } from "../api/client";
import type {
  ApiError,
  Post,
  PostModerationReport,
  PostVoteSummary,
} from "../api/types";
import { useAuth } from "../context/useAuth";
import { useToast } from "../context/ToastContext";

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === "AbortError";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

export default function PostDetailPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyPostId, setBusyPostId] = useState<number | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");

  useEffect(() => {
    if (!postId) {
      navigate("/error/404", { replace: true });
      return;
    }

    const controller = new AbortController();
    const startFrame = window.requestAnimationFrame(() => {
      setLoading(true);
      setError(null);
    });

    api
      .get<Post | ApiError>(`/posts/${postId}`, controller.signal)
      .then(({ status, data }) => {
        if (status === 200) {
          setPost(data as Post);
          return;
        }
        if (status === 404) {
          navigate("/error/404", { replace: true });
          return;
        }
        setPost(null);
        setError((data as ApiError).error ?? `Failed to load post (${status})`);
      })
      .catch((err: unknown) => {
        if (isAbortError(err)) return;
        setPost(null);
        setError("Failed to load post");
      })
      .finally(() => {
        window.cancelAnimationFrame(startFrame);
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      window.cancelAnimationFrame(startFrame);
      controller.abort();
    };
  }, [navigate, postId]);

  async function handleVote(direction: 1 | -1) {
    if (!post) return;
    if (!user) {
      navigate("/login");
      return;
    }

    const value = post.current_user_vote === direction ? 0 : direction;
    setBusyPostId(post.id);
    setError(null);

    const { status, data } = await api.put<PostVoteSummary | ApiError>(
      `/posts/${post.id}/vote`,
      { value }
    );
    setBusyPostId(null);

    if (status === 200) {
      const voteState = data as PostVoteSummary;
      setPost((currentPost) =>
        currentPost ? { ...currentPost, ...voteState } : currentPost
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

  async function handleReport() {
    if (!post) return;
    if (!user) {
      navigate("/login");
      return;
    }

    const reason = reportReason.trim();
    if (!reason) {
      const message = "Report reason is required";
      setError(message);
      addToast(message, "error");
      return;
    }

    setReporting(true);
    setError(null);
    const { status, data } = await api.post<PostModerationReport | ApiError>(
      `/posts/${post.id}/reports`,
      { reason }
    );
    setReporting(false);

    if (status === 201) {
      setReportOpen(false);
      setReportReason("");
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

  function handleCommentCreated() {
    setPost((currentPost) =>
      currentPost
        ? { ...currentPost, comment_count: currentPost.comment_count + 1 }
        : currentPost
    );
  }

  if (loading) {
    return (
      <Layout>
        <main className="page-grid">
          <section className="hero-card">
            <Spinner text="Loading post..." />
          </section>
        </main>
      </Layout>
    );
  }

  return (
    <Layout>
      <main className="page-grid feed-grid">
        <section className="hero-card">
          <span className="eyebrow">Thread Detail</span>
          <h1 className="headline">{post?.title ?? "Post unavailable"}</h1>
          <p className="subhead">
            {post
              ? `Opened from ${post.game_hub.name}. Vote, comment, or review the thread in context.`
              : "The requested post could not be loaded."}
          </p>

          <div className="feed-sidebar-stack">
            <Link className="btn ghost" to="/posts">
              Back To Feed
            </Link>
            {post && user?.id === post.author.id && (
              <Link className="btn primary" to={`/posts/${post.id}/edit`}>
                Edit Post
              </Link>
            )}
            {post &&
              user &&
              user.id !== post.author.id &&
              post.status === "published" && (
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => setReportOpen((open) => !open)}
                >
                  {reportOpen ? "Hide Report Form" : "Report Post"}
                </button>
              )}
            {post && !user && (
              <Link className="btn primary" to="/login">
                Log In To Vote
              </Link>
            )}
          </div>
        </section>

        <section className="form-card feed-card">
          <p className="panel-tag">Selected Thread</p>
          <h2 className="section-title">
            {post ? "Post Details" : "Unable To Load"}
          </h2>
          {error && <p className="form-error">{error}</p>}

          {post && (
            <article className="post-card">
              {post.status === "published" ? (
                <VoteControls
                  vote_score={post.vote_score}
                  upvote_count={post.upvote_count}
                  downvote_count={post.downvote_count}
                  current_user_vote={post.current_user_vote}
                  busy={busyPostId === post.id}
                  onVote={handleVote}
                />
              ) : (
                <div className="vote-rail" aria-label="Draft post status">
                  <strong className="vote-score">-</strong>
                  <p className="vote-meta">{post.status}</p>
                </div>
              )}

              <div className="post-body">
                <div className="post-meta">
                  <span className="post-hub">{post.game_hub.name}</span>
                  <span>
                    by {post.author.username}
                    {post.author.is_trusted && (
                      <span
                        className="pill pill-trusted"
                        title={`Reputation: ${post.author.reputation_score}`}
                      >
                        Trusted
                      </span>
                    )}
                  </span>
                  <span>{formatDate(post.created_at)}</span>
                  {post.is_edited && <span>edited</span>}
                </div>

                <div className="post-badges">
                  {post.status === "draft" && (
                    <span className="pill pill-draft">Draft</span>
                  )}
                  {post.is_pinned && (
                    <span className="pill pill-pinned">Pinned</span>
                  )}
                  {post.is_priority && (
                    <span className="pill pill-priority">Priority</span>
                  )}
                  {post.is_question && (
                    <span className="pill pill-question">Question</span>
                  )}
                  {post.has_spoilers && (
                    <span className="pill pill-warning">Spoilers</span>
                  )}
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
                  {user?.id === post.author.id ? (
                    <Link className="text-link" to={`/posts/${post.id}/edit`}>
                      Edit post
                    </Link>
                  ) : post.status === "published" ? (
                    <>
                      <span className="helper compact">
                        Vote, comment, or report this thread when it needs
                        moderator attention.
                      </span>
                      {user ? (
                        <button
                          className="action-link text-link"
                          type="button"
                          onClick={() => setReportOpen((open) => !open)}
                        >
                          {reportOpen ? "Hide report form" : "Report post"}
                        </button>
                      ) : (
                        <Link className="text-link" to="/login">
                          Log in to join
                        </Link>
                      )}
                    </>
                  ) : (
                    <span className="helper compact">
                      Draft posts can be edited before publishing.
                    </span>
                  )}
                </div>

                {post.status === "published" &&
                  user &&
                  user.id !== post.author.id &&
                  reportOpen && (
                    <div className="report-panel">
                      <p className="report-title">
                        Flag this post for moderator review
                      </p>
                      <p className="helper compact">
                        Use this for spam, untagged spoilers, harassment, or
                        other moderation issues.
                      </p>
                      <div className="field">
                        <label htmlFor={`report-reason-${post.id}`}>
                          Report Reason
                        </label>
                        <textarea
                          id={`report-reason-${post.id}`}
                          rows={3}
                          placeholder="Tell moderators what needs review"
                          value={reportReason}
                          onChange={(event) =>
                            setReportReason(event.target.value)
                          }
                        />
                      </div>
                      <div className="report-actions">
                        <button
                          className="btn secondary"
                          type="button"
                          disabled={reporting}
                          onClick={handleReport}
                        >
                          {reporting ? "Submitting..." : "Submit Report"}
                        </button>
                        <button
                          className="btn ghost"
                          type="button"
                          disabled={reporting}
                          onClick={() => {
                            setReportOpen(false);
                            setReportReason("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                {post.status === "published" ? (
                  <PostComments
                    post={post}
                    canComment={Boolean(user)}
                    expandedByDefault
                    onCommentCreated={handleCommentCreated}
                  />
                ) : (
                  <p className="helper compact">
                    Comments and votes are available after this draft is
                    published.
                  </p>
                )}
              </div>
            </article>
          )}
        </section>
      </main>
    </Layout>
  );
}

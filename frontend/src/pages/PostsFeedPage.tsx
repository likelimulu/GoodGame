import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import PostComments from "../components/PostComments";
import SearchableHubSelect from "../components/SearchableHubSelect";
import VoteControls from "../components/VoteControls";
import Spinner from "../components/Spinner";
import { api } from "../api/client";
import type {
  ApiMessage,
  ApiError,
  DeveloperFeedback,
  GameHub,
  Post,
  PostModerationReport,
  PostVoteSummary,
  Tag,
} from "../api/types";
import { useAuth } from "../context/useAuth";
import { useToast } from "../context/ToastContext";

function sortPosts(posts: Post[], mineOnly: boolean, serverSorted: boolean) {
  if (serverSorted) return posts;
  return [...posts].sort((a, b) => {
    if (mineOnly) {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    }
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1;
    const wa = a.weighted_score ?? a.vote_score;
    const wb = b.weighted_score ?? b.vote_score;
    if (wb !== wa) return wb - wa;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export default function PostsFeedPage({ mineOnly = false }: { mineOnly?: boolean }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sortBy, setSortBy] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterAuthor, setFilterAuthor] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const hubOptions = gameHubs.map((hub) => ({
    value: String(hub.id),
    label: hub.name,
    keywords: [hub.slug],
  }));

  const isTrusted = user?.is_trusted ?? false;

  useEffect(() => {
    if (isTrusted) {
      api.get<Tag[]>("/tags").then(({ status, data }) => {
        if (status === 200 && Array.isArray(data)) setAllTags(data);
      });
    }
  }, [isTrusted]);

  useEffect(() => {
    if (mineOnly && authLoading) return;
    if (mineOnly && !user) {
      navigate("/login", { replace: true });
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    const params = new URLSearchParams();
    if (selectedHubId !== "all") params.set("game_hub_id", selectedHubId);
    if (mineOnly) params.set("mine", "true");
    if (isTrusted && sortBy) params.set("sort_by", sortBy);
    if (isTrusted && filterTag) params.set("tag", filterTag);
    if (isTrusted && filterAuthor) params.set("author", filterAuthor);
    if (isTrusted && filterDateFrom) params.set("date_from", filterDateFrom);
    if (isTrusted && filterDateTo) params.set("date_to", filterDateTo);
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
          const useServerOrder = isTrusted && !!sortBy;
          setPosts(sortPosts(postsResponse.data as Post[], mineOnly, useServerOrder));
        } else if (postsResponse.status === 401 && mineOnly) {
          navigate("/login", { replace: true });
        } else if (postsResponse.status !== 0) {
          navigate(`/error/${postsResponse.status}`, { replace: true });
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
  }, [authLoading, mineOnly, navigate, user, selectedHubId, sortBy, filterTag, filterAuthor, filterDateFrom, filterDateTo, isTrusted]);

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
          isTrusted && !!sortBy,
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

  async function handleFeedback() {
    if (!user) {
      navigate("/login");
      return;
    }

    const hubId = Number.parseInt(selectedHubId, 10);
    if (Number.isNaN(hubId)) {
      addToast("Select a game hub first", "error");
      return;
    }

    const message = feedbackMessage.trim();
    if (!message) {
      addToast("Message is required", "error");
      return;
    }
    if (message.length > 2000) {
      addToast("Message cannot exceed 2000 characters", "error");
      return;
    }

    setSubmittingFeedback(true);
    const { status, data } = await api.post<DeveloperFeedback | ApiError>(
      `/gamehubs/${hubId}/feedback`,
      { message },
    );
    setSubmittingFeedback(false);

    if (status === 201) {
      setFeedbackOpen(false);
      setFeedbackMessage("");
      addToast("Your message has been sent to the developers!", "success");
      return;
    }

    if (status === 401) {
      navigate("/login");
      return;
    }

    const errMsg = (data as ApiError).error ?? "Failed to send feedback";
    addToast(errMsg, "error");
  }

  return (
    <Layout>
      <main className="page-grid feed-grid">
        <section className="hero-card">
          <span className="eyebrow">{mineOnly ? "Post Studio" : "Patch Feed"}</span>
          <h1 className="headline">
            {mineOnly && !loading && posts.length === 0
              ? "No posts yet"
              : mineOnly
                ? "My Posts"
                : "Community Feed"}
          </h1>
          <p className="subhead">
            {mineOnly && !loading && posts.length === 0
              ? "You haven't posted yet — don't you have anything to say? Make your first post to make your voice heard."
              : mineOnly
                ? "Review your drafts and published threads, then edit or remove them when you need to."
                : "Browse published posts, push strong threads upward, and bury weak ones."}
          </p>

          <div className="feed-sidebar-stack">
            <div className="field">
              <label htmlFor="hub-filter">Game Hub</label>
              <SearchableHubSelect
                id="hub-filter"
                value={selectedHubId}
                options={hubOptions}
                clearValue="all"
                clearLabel="Show All Hubs"
                promptLabel="Type to filter forums."
                onChange={(nextValue) => {
                  setLoading(true);
                  setError(null);
                  setFeedbackOpen(false);
                  setSelectedHubId(nextValue);
                }}
              />
            </div>

            {isTrusted && !mineOnly && (
              <button
                className="btn ghost"
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                {showAdvanced ? "Hide Advanced Filters" : "Advanced Filters ✦"}
              </button>
            )}

            {showAdvanced && isTrusted && !mineOnly && (
              <div className="advanced-filters">
                <p className="advanced-filters-title">Trusted User Filters</p>
                <div className="advanced-filters-grid">
                  <div className="field">
                    <label htmlFor="sort-by">Sort By</label>
                    <select
                      id="sort-by"
                      value={sortBy}
                      onChange={(e) => { setLoading(true); setSortBy(e.target.value); }}
                    >
                      <option value="">Recommended</option>
                      <option value="votes">Most Votes</option>
                      <option value="newest">Newest</option>
                      <option value="oldest">Oldest</option>
                      <option value="most_commented">Most Commented</option>
                      <option value="controversial">Controversial</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="filter-tag">Tag</label>
                    <select
                      id="filter-tag"
                      value={filterTag}
                      onChange={(e) => { setLoading(true); setFilterTag(e.target.value); }}
                    >
                      <option value="">All Tags</option>
                      {allTags.map((t) => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="filter-author">Author</label>
                    <input
                      id="filter-author"
                      type="text"
                      placeholder="Username..."
                      value={filterAuthor}
                      onChange={(e) => setFilterAuthor(e.target.value)}
                      onBlur={() => setLoading(true)}
                      onKeyDown={(e) => { if (e.key === "Enter") setLoading(true); }}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="filter-date-from">From</label>
                    <input
                      id="filter-date-from"
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => { setLoading(true); setFilterDateFrom(e.target.value); }}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="filter-date-to">To</label>
                    <input
                      id="filter-date-to"
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => { setLoading(true); setFilterDateTo(e.target.value); }}
                    />
                  </div>
                </div>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => {
                    setSortBy("");
                    setFilterTag("");
                    setFilterAuthor("");
                    setFilterDateFrom("");
                    setFilterDateTo("");
                    setLoading(true);
                  }}
                >
                  Clear All Filters
                </button>
              </div>
            )}

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

            {user && !mineOnly && selectedHubId !== "all" && (
              <button
                className="btn ghost"
                type="button"
                onClick={() => setFeedbackOpen((prev) => !prev)}
              >
                {feedbackOpen ? "Hide Feedback Form" : "Send Feedback to Developers"}
              </button>
            )}

            {feedbackOpen && selectedHubId !== "all" && (
              <div className="feedback-form">
                <p className="feedback-form-title">Send feedback to this game's developers</p>
                <div className="field">
                  <label htmlFor="feedback-message">Your Message</label>
                  <textarea
                    id="feedback-message"
                    rows={4}
                    maxLength={2000}
                    placeholder="Share your thoughts with the developers..."
                    value={feedbackMessage}
                    onChange={(e) => setFeedbackMessage(e.target.value)}
                  />
                </div>
                <div className="report-actions">
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={submittingFeedback}
                    onClick={handleFeedback}
                  >
                    {submittingFeedback ? "Sending…" : "Send Feedback"}
                  </button>
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={submittingFeedback}
                    onClick={() => {
                      setFeedbackOpen(false);
                      setFeedbackMessage("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
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

          {error && !mineOnly && <p className="form-error">{error}</p>}

          {loading ? (
            <div className="feed-empty-state">
              <Spinner text="Loading posts…" />
            </div>
          ) : posts.length === 0 ? (
            <div className="feed-empty-state">
              {mineOnly ? (
                <>
                  <h3 className="empty-title">No posts yet</h3>
                  <p className="helper">
                    You haven't posted yet — don't you have anything to say? Make your first post to make your voice heard.
                  </p>
                  <Link className="btn primary" style={{ marginTop: "1rem" }} to="/posts/create">
                    Write your first post
                  </Link>
                </>
              ) : (
                <>
                  <h3 className="empty-title">No posts yet</h3>
                  <p className="helper">
                    Start the first thread in this hub and give other players something to react to.
                  </p>
                </>
              )}
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
                      <span>
                        by {post.author.username}
                        {post.author.is_trusted && (
                          <span className="pill pill-trusted" title={`Reputation: ${post.author.reputation_score}`}>Trusted</span>
                        )}
                      </span>
                      <span>{new Date(post.created_at).toLocaleDateString()}</span>
                      {post.is_edited && <span>edited</span>}
                    </div>

                    <div className="post-badges">
                      {mineOnly && post.status === "draft" && (
                        <span className="pill pill-draft">Draft</span>
                      )}
                      {post.is_pinned && <span className="pill pill-pinned">📌 Pinned</span>}
                      {post.is_priority && <span className="pill pill-priority">Priority</span>}
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
                            onClick={() => {
                              if (!user) {
                                navigate("/login");
                                return;
                              }
                              setOpenReportPostId((current) =>
                                current === post.id ? null : post.id,
                              );
                            }}
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
                        currentUserId={user?.id ?? null}
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

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import Spinner from "../components/Spinner";
import { api } from "../api/client";
import type { ApiError, GameHub, Post } from "../api/types";

function formatMetric(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getStatusClass(status: string) {
  return `dev-post-status dev-post-status-${status}`;
}

export default function DeveloperPage() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    Promise.all([
      api.get<GameHub[]>("/gamehubs", signal),
      api.get<Post[] | ApiError>("/posts?mine=true", signal),
    ])
      .then(([, postsRes]) => {
        if (postsRes.status === 200 && Array.isArray(postsRes.data)) {
          setPosts(
            [...(postsRes.data as Post[])].sort(
              (a, b) =>
                new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
            )
          );
        } else if (postsRes.status !== 0) {
          navigate(`/error/${postsRes.status}`, { replace: true });
        } else {
          setError((postsRes.data as ApiError).error ?? "Failed to load posts");
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError("Failed to load posts");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [navigate]);

  const metrics = useMemo(() => {
    const totalPosts = posts.length;
    const totalUpvotes = posts.reduce((sum, p) => sum + p.upvote_count, 0);
    const totalDownvotes = posts.reduce((sum, p) => sum + p.downvote_count, 0);
    const totalComments = posts.reduce((sum, p) => sum + p.comment_count, 0);
    const avgInteractions =
      totalPosts > 0
        ? ((totalUpvotes + totalDownvotes + totalComments) / totalPosts).toFixed(1)
        : "0.0";
    const topPost =
      posts.length > 0
        ? posts.reduce((best, p) => (p.upvote_count > best.upvote_count ? p : best), posts[0])
        : null;
    return {
      totalPosts,
      totalUpvotes,
      totalDownvotes,
      totalComments,
      avgInteractions,
      topPost,
      publishedCount: posts.filter((p) => p.status === "published").length,
      draftCount: posts.filter((p) => p.status === "draft").length,
    };
  }, [posts]);

  return (
    <Layout>
      <main className="page-grid developer-grid">
        <section className="hero-card">
          <span className="eyebrow">Developer Hub</span>
          <h1 className="headline">Content Manager</h1>
          <p className="subhead">
            Create and publish game updates, track engagement metrics, and manage
            your content strategy.
          </p>

          <div className="dev-sidebar-stats">
            <div className="dev-stat-panel">
              <span className="dev-stat-panel-label">Total Posts</span>
              <p className="dev-stat-panel-value">{metrics.totalPosts} posts</p>
              <span className="dev-stat-panel-sub">Published across all games</span>
            </div>

            <div className="dev-stat-panel">
              <span className="dev-stat-panel-label">Avg Interactions</span>
              <p className="dev-stat-panel-value">{metrics.avgInteractions} per post</p>
              <span className="dev-stat-panel-sub">Average across all content</span>
            </div>

            {metrics.topPost && (
              <div className="dev-stat-panel">
                <span className="dev-stat-panel-label">Top Post</span>
                <p className="dev-stat-panel-value">{metrics.topPost.title}</p>
                <span className="dev-stat-panel-sub">Leading with most upvotes</span>
              </div>
            )}
          </div>
        </section>

        <section className="form-card feed-card">
          <p className="panel-tag">Developer Workspace</p>
          <h2 className="section-title">Performance Metrics</h2>

          {error && <p className="form-error">{error}</p>}

          {loading ? (
            <div className="feed-empty-state">
              <Spinner text="Loading developer data…" />
            </div>
          ) : (
            <>
              <div className="dev-metrics-grid">
                <article className="dev-metric-card">
                  <span className="dev-metric-label">Total Posts</span>
                  <p className="dev-metric-value">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="dev-metric-icon">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                    {formatMetric(metrics.totalPosts)}
                  </p>
                </article>
                <article className="dev-metric-card">
                  <span className="dev-metric-label">Upvotes</span>
                  <p className="dev-metric-value">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="dev-metric-icon">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                      <polyline points="17 6 23 6 23 12" />
                    </svg>
                    {formatMetric(metrics.totalUpvotes)}
                  </p>
                </article>
                <article className="dev-metric-card">
                  <span className="dev-metric-label">Downvotes</span>
                  <p className="dev-metric-value">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="dev-metric-icon">
                      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
                      <polyline points="17 18 23 18 23 12" />
                    </svg>
                    {formatMetric(metrics.totalDownvotes)}
                  </p>
                </article>
                <article className="dev-metric-card">
                  <span className="dev-metric-label">Comments</span>
                  <p className="dev-metric-value">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="dev-metric-icon">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    </svg>
                    {formatMetric(metrics.totalComments)}
                  </p>
                </article>
              </div>

              <div className="meta-row">
                <p className="helper">
                  {metrics.publishedCount} published · {metrics.draftCount} drafts
                </p>
                <Link className="btn primary" to="/posts/create">
                  New Post
                </Link>
              </div>

              {posts.length === 0 ? (
                <div className="feed-empty-state">
                  <h3 className="empty-title">No Posts Yet</h3>
                  <p className="helper">
                    Start publishing game content to see your metrics here.
                  </p>
                </div>
              ) : (
                <div className="dev-post-list">
                  {posts.map((post) => (
                    <article className="dev-post-item" key={post.id}>
                      <div className="dev-post-head">
                        <div className="dev-post-info">
                          <h3 className="dev-post-title">{post.title}</h3>
                          <div className="dev-post-meta">
                            <span className="post-hub">{post.game_hub.name}</span>
                            <span>Updated {formatDate(post.updated_at)}</span>
                          </div>
                        </div>
                        <span className={getStatusClass(post.status)}>
                          {post.status}
                        </span>
                      </div>

                      <div className="dev-post-footer">
                        <div className="dev-post-stats">
                          <span className="dev-stat">
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path d="M12 4l8 8H4z" />
                            </svg>
                            {post.vote_score}
                          </span>
                          <span className="dev-stat">
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path d="M20 2H4a2 2 0 00-2 2v12a2 2 0 002 2h14l4 4V4a2 2 0 00-2-2z" />
                            </svg>
                            {post.comment_count}
                          </span>
                          {post.is_question && (
                            <span className="pill pill-question">Question</span>
                          )}
                          {post.has_spoilers && (
                            <span className="pill pill-warning">Spoilers</span>
                          )}
                        </div>
                        {post.status !== "deleted" && (
                          <Link
                            className="btn ghost dev-edit-btn"
                            to={`/posts/${post.id}/edit`}
                          >
                            Edit
                          </Link>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </Layout>
  );
}

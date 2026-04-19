import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import Spinner from "../components/Spinner";
import { api } from "../api/client";
import type { ApiError, Post } from "../api/types";

function sortRecentPosts(posts: Post[]) {
  return [...posts].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

export default function ModeratorWorkspacePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    api
      .get<Post[] | ApiError>("/posts", controller.signal)
      .then(({ status, data }) => {
        if (cancelled) return;
        if (status === 200 && Array.isArray(data)) {
          setPosts(sortRecentPosts(data));
          return;
        }
        setError((data as ApiError).error ?? "Failed to load moderator workspace");
      })
      .catch((err) => {
        if (!cancelled && err.name !== "AbortError") {
          setError("Failed to load moderator workspace");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const summary = useMemo(() => {
    const spoilerCount = posts.filter((post) => post.has_spoilers).length;
    const questionCount = posts.filter((post) => post.is_question).length;
    const activeDiscussionCount = posts.filter((post) => post.comment_count >= 2).length;
    const heavyVoteCount = posts.filter((post) => Math.abs(post.vote_score) >= 2).length;

    return {
      total: posts.length,
      spoilers: spoilerCount,
      questions: questionCount,
      active: activeDiscussionCount,
      heavyVotes: heavyVoteCount,
    };
  }, [posts]);

  const reviewQueue = useMemo(() => posts.slice(0, 5), [posts]);

  return (
    <Layout>
      <main className="page-grid moderator-grid">
        <section className="hero-card">
          <span className="eyebrow">Control Room</span>
          <h1 className="headline">Moderator Home</h1>
          <p className="subhead">
            Separate workspace for queue review, content checks, and moderator guidance.
          </p>

          <div className="feed-sidebar-stack">
            <p className="helper moderator-hero-copy">
              The moderation workflow is kept outside the regular user feed. This workspace
              surfaces recent public content until reporting and flagging APIs are added.
            </p>

            <div className="moderator-summary-grid">
              <article className="moderator-summary-card">
                <span className="panel-tag">Published Threads</span>
                <p className="moderator-summary-value">{summary.total}</p>
              </article>
              <article className="moderator-summary-card">
                <span className="panel-tag">Spoiler Tagged</span>
                <p className="moderator-summary-value">{summary.spoilers}</p>
              </article>
              <article className="moderator-summary-card">
                <span className="panel-tag">Question Posts</span>
                <p className="moderator-summary-value">{summary.questions}</p>
              </article>
              <article className="moderator-summary-card">
                <span className="panel-tag">Active Discussions</span>
                <p className="moderator-summary-value">{summary.active}</p>
              </article>
            </div>
          </div>
        </section>

        <section className="form-card feed-card">
          <p className="panel-tag">Moderator Workspace</p>
          <h2 className="section-title">Review Queue</h2>
          <p className="helper">
            This page gives moderators a separate place to review active content without
            adding moderator navigation to the public user flow.
          </p>

          {error && <p className="form-error">{error}</p>}

          {loading ? (
            <div className="feed-empty-state">
              <Spinner text="Loading moderator workspace…" />
            </div>
          ) : (
            <>
              <div className="moderator-card-grid">
                <section className="moderator-panel">
                  <div className="moderator-panel-head">
                    <div>
                      <h3 className="moderator-panel-title">Recent Threads For Review</h3>
                      <p className="helper">
                        Newest posts surface first so moderators can quickly scan public
                        content for spoilers, spam, or low-quality reposts.
                      </p>
                    </div>
                    <span className="pill moderator-pill">
                      {summary.heavyVotes} high-signal
                    </span>
                  </div>

                  {reviewQueue.length === 0 ? (
                    <p className="helper">
                      No published posts are available right now. New public threads will show
                      up here once users post to the feed.
                    </p>
                  ) : (
                    <div className="moderator-list">
                      {reviewQueue.map((post) => (
                        <article className="moderator-item" key={post.id}>
                          <div className="moderator-item-head">
                            <div>
                              <h4 className="moderator-item-title">{post.title}</h4>
                              <div className="moderator-item-meta">
                                <span>{post.game_hub.name}</span>
                                <span>by {post.author.username}</span>
                                <span>{new Date(post.updated_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <span className="pill moderator-score-pill">
                              score {post.vote_score}
                            </span>
                          </div>

                          <p className="moderator-item-copy">{post.body}</p>

                          <div className="post-badges">
                            {post.is_question && (
                              <span className="pill pill-question">Question</span>
                            )}
                            {post.has_spoilers && (
                              <span className="pill pill-warning">Spoilers</span>
                            )}
                            {post.tags.map((tag) => (
                              <span className="tag" key={tag.id}>
                                {tag.name}
                              </span>
                            ))}
                          </div>

                          <div className="moderator-action-row">
                            <span className="helper">
                              {post.comment_count} comments · {post.upvote_count} upvotes ·{" "}
                              {post.downvote_count} downvotes
                            </span>
                            <Link className="btn ghost" to="/posts">
                              Open Community Feed
                            </Link>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <div className="moderator-side-column">
                  <section className="moderator-panel">
                    <div className="moderator-panel-head">
                      <div>
                        <h3 className="moderator-panel-title">Quick Rules</h3>
                        <p className="helper">
                          Keep the moderation standards visible until full tooling is ready.
                        </p>
                      </div>
                    </div>

                    <ul className="rule-list">
                      <li>Check spoiler-tag coverage before a guide or strategy thread stays live.</li>
                      <li>Watch for repeated reposts that only change the title to stay visible.</li>
                      <li>Use the community feed to inspect context before taking a moderation action.</li>
                      <li>Escalate anything that needs admin role changes or policy-level review.</li>
                    </ul>
                  </section>

                  <section className="moderator-panel">
                    <div className="moderator-panel-head">
                      <div>
                        <h3 className="moderator-panel-title">Current Limits</h3>
                        <p className="helper">
                          This workspace is intentionally separate, but the deeper moderation
                          APIs still need to be built.
                        </p>
                      </div>
                    </div>

                    <div className="moderator-limit-list">
                      <p className="helper">No flag queue endpoint yet</p>
                      <p className="helper">No direct post removal action in the moderator UI yet</p>
                      <p className="helper">Admin approval stays on the admin queue page</p>
                    </div>
                  </section>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </Layout>
  );
}

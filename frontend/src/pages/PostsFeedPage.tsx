import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import VoteControls from "../components/VoteControls";
import { api } from "../api/client";
import type {
  ApiError,
  GameHub,
  Post,
  PostVoteSummary,
} from "../api/types";
import { useAuth } from "../context/useAuth";

function sortPosts(posts: Post[]) {
  return [...posts].sort((a, b) => {
    if (b.vote_score !== a.vote_score) return b.vote_score - a.vote_score;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export default function PostsFeedPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [gameHubs, setGameHubs] = useState<GameHub[]>([]);
  const [selectedHubId, setSelectedHubId] = useState("all");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPostId, setBusyPostId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const postPath =
      selectedHubId === "all" ? "/posts" : `/posts?game_hub_id=${selectedHubId}`;

    Promise.all([
      api.get<GameHub[]>("/gamehubs", signal),
      api.get<Post[] | ApiError>(postPath, signal),
    ])
      .then(([gameHubResponse, postsResponse]) => {
        setGameHubs(gameHubResponse.data);
        if (postsResponse.status === 200) {
          setPosts(sortPosts(postsResponse.data as Post[]));
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
  }, [selectedHubId]);

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
        ),
      );
      return;
    }

    if (status === 401) {
      navigate("/login");
      return;
    }

    setError((data as ApiError).error ?? "Failed to save vote");
  }

  return (
    <Layout>
      <main className="page-grid feed-grid">
        <section className="hero-card">
          <span className="eyebrow">Patch Feed</span>
          <h1 className="headline">Community Feed</h1>
          <p className="subhead">
            Browse published posts, push strong threads upward, and bury weak ones.
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
                {selectedHubId === "all" ? "Create Post" : "Create In This Hub"}
              </Link>
            ) : (
              <Link className="btn primary" to="/login">
                Log In To Vote
              </Link>
            )}

            <p className="helper">
              {user
                ? selectedHubId === "all"
                  ? "Upvote or downvote from the feed. Click the same arrow again to clear your vote."
                  : "Voting updates the feed order live, and new posts will open with this hub preselected."
                : "Sign in to vote, create posts, and edit your own threads."}
            </p>
          </div>
        </section>

        <section className="form-card feed-card">
          <p className="panel-tag">Live Threads</p>
          <h2 className="section-title">Top Discussions</h2>
          <p className="helper">
            Published posts are ranked by player votes and shown newest first within the current list.
          </p>

          {error && <p className="form-error">{error}</p>}

          {loading ? (
            <div className="feed-empty-state">
              <p className="helper">Loading posts…</p>
            </div>
          ) : posts.length === 0 ? (
            <div className="feed-empty-state">
              <h3 className="empty-title">No posts yet</h3>
              <p className="helper">
                Start the first thread in this hub and give other players something to react to.
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
                      {user?.id === post.author.id ? (
                        <Link className="text-link" to={`/posts/${post.id}/edit`}>
                          Edit post
                        </Link>
                      ) : (
                        <span className="helper compact">
                          Vote to surface useful posts for the next reader.
                        </span>
                      )}
                    </div>
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

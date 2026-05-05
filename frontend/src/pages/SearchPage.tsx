import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import Spinner from "../components/Spinner";
import { api } from "../api/client";
import type { ApiError, Post, SearchResponse } from "../api/types";

const MIN_SEARCH_QUERY_LENGTH = 2;

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function resultCount(results: SearchResponse | null) {
  if (!results) return 0;
  return (
    results.posts.length +
    results.game_hubs.length +
    results.tags.length +
    results.users.length
  );
}

function postPreview(post: Post) {
  const body = post.body.trim();
  if (body.length <= 220) return body;
  return body.slice(0, 217).trimEnd() + "...";
}

export default function SearchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const query = useMemo(() => searchParams.get("q")?.trim() ?? "", [searchParams]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.length < MIN_SEARCH_QUERY_LENGTH) {
      const frame = window.requestAnimationFrame(() => {
        setResults(null);
        setLoading(false);
        setError(null);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ q: query });
    const startFrame = window.requestAnimationFrame(() => {
      setLoading(true);
      setError(null);
    });

    api
      .get<SearchResponse | ApiError>(`/search?${params.toString()}`, controller.signal)
      .then(({ status, data }) => {
        if (status === 200) {
          setResults(data as SearchResponse);
          return;
        }
        setResults(null);
        setError((data as ApiError).error ?? `Search failed (${status})`);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResults(null);
        setError("Failed to run search");
      })
      .finally(() => {
        window.cancelAnimationFrame(startFrame);
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      window.cancelAnimationFrame(startFrame);
      controller.abort();
    };
  }, [query]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = searchInputRef.current?.value.trim() ?? "";
    navigate(nextQuery ? `/search?q=${encodeURIComponent(nextQuery)}` : "/search");
  }

  const totalResults = resultCount(results);
  const showPrompt = query.length === 0;
  const showShortQuery = query.length > 0 && query.length < MIN_SEARCH_QUERY_LENGTH;
  const showEmpty = !loading && !error && results !== null && totalResults === 0;

  return (
    <Layout>
      <main className="page-grid search-grid">
        <section className="hero-card">
          <span className="eyebrow">Global Search</span>
          <h1 className="headline">Find Threads</h1>
          <p className="subhead">
            Search published posts, hubs, tags, and authors in one place.
          </p>
        </section>

        <section className="form-card feed-card">
          <p className="panel-tag">Search GoodGame</p>
          <h2 className="section-title">
            {query.length >= MIN_SEARCH_QUERY_LENGTH ? query : "Search GoodGame"}
          </h2>
          <p className="helper">
            {query.length >= MIN_SEARCH_QUERY_LENGTH
              ? `${totalResults} result${totalResults === 1 ? "" : "s"} found.`
              : "Enter at least two characters to start searching."}
          </p>

          <form className="form-fields" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="search-page-query">Search Query</label>
              <input
                key={query}
                ref={searchInputRef}
                id="search-page-query"
                type="search"
                defaultValue={query}
                placeholder="Patch notes, raid, username..."
              />
            </div>
            <div className="action-row">
              <button className="btn secondary" type="submit">
                Search
              </button>
            </div>
          </form>

          {error && <p className="form-error">{error}</p>}

          {loading ? (
            <div className="feed-empty-state">
              <Spinner text="Searching…" />
            </div>
          ) : showPrompt ? (
            <div className="feed-empty-state">
              <h3 className="empty-title">Start A Search</h3>
              <p className="helper">
                Search terms can match post titles, post bodies, hub names, tags, and author usernames.
              </p>
            </div>
          ) : showShortQuery ? (
            <div className="feed-empty-state">
              <h3 className="empty-title">Keep Typing</h3>
              <p className="helper">Search terms need at least two characters.</p>
            </div>
          ) : showEmpty ? (
            <div className="feed-empty-state">
              <h3 className="empty-title">No Results</h3>
              <p className="helper">Try a different post title, tag, game hub, or author.</p>
            </div>
          ) : results ? (
            <div className="search-results">
              {results.posts.length > 0 && (
                <section className="search-section">
                  <div className="search-section-head">
                    <h3 className="search-section-title">Posts</h3>
                    <span className="search-count">{results.posts.length}</span>
                  </div>
                  <div className="search-result-list">
                    {results.posts.map((post) => (
                      <article className="search-result-card" key={post.id}>
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
                        </div>

                        <h4 className="search-result-title">{post.title}</h4>
                        <p className="search-post-copy">{postPreview(post)}</p>

                        {post.tags.length > 0 && (
                          <div className="tag-row">
                            {post.tags.map((tag) => (
                              <span className="tag" key={tag.id}>
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="search-result-meta">
                          <span>{post.vote_score} score</span>
                          <span>{post.comment_count} comments</span>
                          {post.is_question && <span className="pill pill-question">Question</span>}
                          {post.has_spoilers && <span className="pill pill-warning">Spoilers</span>}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {results.game_hubs.length > 0 && (
                <section className="search-section">
                  <div className="search-section-head">
                    <h3 className="search-section-title">Game Hubs</h3>
                    <span className="search-count">{results.game_hubs.length}</span>
                  </div>
                  <div className="search-chip-list">
                    {results.game_hubs.map((hub) => (
                      <Link
                        className="search-chip"
                        key={hub.id}
                        to={`/search?q=${encodeURIComponent(hub.name)}`}
                      >
                        <span>{hub.name}</span>
                        <small>{hub.slug}</small>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {results.tags.length > 0 && (
                <section className="search-section">
                  <div className="search-section-head">
                    <h3 className="search-section-title">Tags</h3>
                    <span className="search-count">{results.tags.length}</span>
                  </div>
                  <div className="search-chip-list">
                    {results.tags.map((tag) => (
                      <Link
                        className="search-chip search-chip-compact"
                        key={tag.id}
                        to={`/search?q=${encodeURIComponent(tag.name)}`}
                      >
                        {tag.name}
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {results.users.length > 0 && (
                <section className="search-section">
                  <div className="search-section-head">
                    <h3 className="search-section-title">Authors</h3>
                    <span className="search-count">{results.users.length}</span>
                  </div>
                  <div className="search-user-grid">
                    {results.users.map((user) => (
                      <Link
                        className="search-user-card"
                        key={user.id}
                        to={`/search?q=${encodeURIComponent(user.username)}`}
                      >
                        <span className="search-user-name">{user.username}</span>
                        <span className="search-user-meta">
                          {user.reputation_score} reputation
                          {user.is_trusted ? " · Trusted" : ""}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : null}
        </section>
      </main>
    </Layout>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import SearchableHubSelect from "../components/SearchableHubSelect";
import TagEditor from "../components/TagEditor";
import { api } from "../api/client";
import type { GameHub, Post, PostStatus, ApiError, Tag } from "../api/types";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/useAuth";

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === "AbortError";
}

export default function CreatePostPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const { user } = useAuth();

  const [gameHubs, setGameHubs] = useState<GameHub[]>([]);
  const [selectedHubId, setSelectedHubId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const requestedHubId = useMemo(() => searchParams.get("hub") ?? "", [searchParams]);
  const hubOptions = useMemo(
    () =>
      gameHubs.map((hub) => ({
        value: String(hub.id),
        label: hub.name,
        keywords: [hub.slug],
      })),
    [gameHubs],
  );

  const hubsEndpoint =
    user?.role === "developer" ? "/developer/gamehubs" : "/gamehubs";

  useEffect(() => {
    const controller = new AbortController();
    api
      .get<GameHub[]>(hubsEndpoint, controller.signal)
      .then(({ status, data }) => {
        if (status !== 200 || !Array.isArray(data)) return;
        setGameHubs(data);
        if (data.length === 0) return;

        const requestedHubExists = data.some(
          (hub) => String(hub.id) === requestedHubId
        );
        if (requestedHubExists) {
          setSelectedHubId(requestedHubId);
          return;
        }

        setSelectedHubId(String(data[0].id));
      })
      .catch((err: unknown) => {
        if (isAbortError(err)) return;
        setError("Failed to load game hubs");
      });
    return () => controller.abort();
  }, [requestedHubId, hubsEndpoint]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (!title.trim() && !body.trim()) {
        setSuggestedTags([]);
        return;
      }
      api
        .get<Tag[]>(
          `/tags/suggest?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`,
          controller.signal
        )
        .then(({ status, data }) => {
          if (status === 200 && Array.isArray(data))
            setSuggestedTags(data.map((t) => t.name));
        })
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [title, body]);

  async function handleSubmit(
    e: { preventDefault(): void; currentTarget: HTMLFormElement },
    status: PostStatus
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    const gameHubId = parseInt(selectedHubId, 10);
    const tagsRaw = (form.elements.namedItem("tags") as HTMLInputElement).value;
    const tags = tagsRaw ? tagsRaw.split(",").filter(Boolean) : [];
    const isQuestion = (
      form.elements.namedItem("is_question") as HTMLInputElement
    ).checked;
    const hasSpoilers = (
      form.elements.namedItem("contains_spoilers") as HTMLInputElement
    ).checked;

    if (Number.isNaN(gameHubId)) {
      const errMsg = "Select a forum before publishing.";
      setError(errMsg);
      addToast(errMsg, "error");
      return;
    }

    setError(null);
    setSubmitting(true);
    const { status: resStatus, data } = await api.post<Post | ApiError>(
      "/posts",
      {
        game_hub_id: gameHubId,
        title,
        body,
        tags,
        is_question: isQuestion,
        has_spoilers: hasSpoilers,
        status,
      }
    );
    setSubmitting(false);

    if (resStatus === 201) {
      addToast("Post created!", "success");
      navigate("/my-posts");
    } else {
      const errMsg = (data as ApiError).error ?? "Failed to create post";
      setError(errMsg);
      addToast(errMsg, "error");
    }
  }

  return (
    <Layout>
      <main className="page-grid">
        <section className="hero-card">
          <span className="eyebrow">Arcade Garage</span>
          <h1 className="headline">Create Post</h1>
          <p className="subhead">
            Choose a forum, add a title and body, and publish to the feed.
          </p>
        </section>

        <section className="form-card">
          <p className="panel-tag">Post Studio</p>
          <h2 className="section-title">New Post</h2>
          <p className="helper">
            Forum, title, and body are required. Save as draft or publish.
          </p>

          <form
            className="form-fields"
            onSubmit={(e) => {
              const btn = (e.nativeEvent as SubmitEvent)
                .submitter as HTMLButtonElement | null;
              handleSubmit(e, (btn?.value ?? "published") as PostStatus);
            }}
          >
            {error && <p className="form-error">{error}</p>}

            <div className="field">
              <label htmlFor="post-create-forum">Forum</label>
              <SearchableHubSelect
                id="post-create-forum"
                name="game_hub_id"
                value={selectedHubId}
                options={hubOptions}
                required
                disabled={gameHubs.length === 0}
                onChange={setSelectedHubId}
              />
            </div>

            <div className="field">
              <label htmlFor="post-create-title">Post Title</label>
              <input
                id="post-create-title"
                name="title"
                type="text"
                placeholder="Example: New patch changed ranked recoil patterns"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="post-create-body">Post Body</label>
              <textarea
                id="post-create-body"
                name="body"
                placeholder="Share details, context, and your recommendation for other players..."
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>

            <TagEditor
              placeholder="Add a tag like Ranked"
              suggestedTags={suggestedTags}
            />

            <div className="check-grid">
              <label className="check">
                <input name="is_question" type="checkbox" />
                <span>Mark this post as a question.</span>
              </label>
              <label className="check">
                <input name="contains_spoilers" type="checkbox" />
                <span>This post contains spoilers.</span>
              </label>
            </div>

            <div className="action-row">
              <button
                className="btn primary"
                type="submit"
                name="status"
                value="published"
                disabled={submitting}
              >
                {submitting ? "Publishing…" : "Publish Post"}
              </button>
              <button
                className="btn secondary"
                type="submit"
                name="status"
                value="draft"
                disabled={submitting}
              >
                {submitting ? "Saving…" : "Save Draft"}
              </button>
            </div>
          </form>
        </section>
      </main>
    </Layout>
  );
}

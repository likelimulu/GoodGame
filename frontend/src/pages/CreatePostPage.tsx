import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import TagEditor from "../components/TagEditor";
import { api } from "../api/client";
import type { GameHub, Post, PostStatus, ApiError } from "../api/types";

export default function CreatePostPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [gameHubs, setGameHubs] = useState<GameHub[]>([]);
  const [selectedHubId, setSelectedHubId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const requestedHubId = useMemo(() => searchParams.get("hub") ?? "", [searchParams]);

  useEffect(() => {
    const controller = new AbortController();
    api.get<GameHub[]>("/gamehubs", controller.signal).then(({ data }) => {
      setGameHubs(data);
      if (data.length === 0) return;

      const requestedHubExists = data.some((hub) => String(hub.id) === requestedHubId);
      if (requestedHubExists) {
        setSelectedHubId(requestedHubId);
        return;
      }

      setSelectedHubId(String(data[0].id));
    });
    return () => controller.abort();
  }, [requestedHubId]);

  async function handleSubmit(
    e: { preventDefault(): void; currentTarget: HTMLFormElement },
    status: PostStatus,
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    const gameHubId = parseInt((form.elements.namedItem("game_hub_id") as HTMLSelectElement).value);
    const title = (form.elements.namedItem("title") as HTMLInputElement).value;
    const body = (form.elements.namedItem("body") as HTMLTextAreaElement).value;
    const tagsRaw = (form.elements.namedItem("tags") as HTMLInputElement).value;
    const tags = tagsRaw ? tagsRaw.split(",").filter(Boolean) : [];
    const isQuestion = (form.elements.namedItem("is_question") as HTMLInputElement).checked;
    const hasSpoilers = (form.elements.namedItem("contains_spoilers") as HTMLInputElement).checked;

    setError(null);
    setSubmitting(true);
    const { status: resStatus, data } = await api.post<Post | ApiError>("/posts", {
      game_hub_id: gameHubId,
      title,
      body,
      tags,
      is_question: isQuestion,
      has_spoilers: hasSpoilers,
      status,
    });
    setSubmitting(false);

    if (resStatus === 201) {
      navigate("/my-posts");
    } else {
      setError((data as ApiError).error ?? "Failed to create post");
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
              const btn = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
              handleSubmit(e, (btn?.value ?? "published") as PostStatus);
            }}
          >
            {error && <p className="form-error">{error}</p>}

            <div className="field">
              <label htmlFor="post-create-forum">Forum</label>
              <select
                id="post-create-forum"
                name="game_hub_id"
                required
                value={selectedHubId}
                onChange={(e) => setSelectedHubId(e.target.value)}
              >
                {gameHubs.map((hub) => (
                  <option key={hub.id} value={hub.id}>
                    {hub.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="post-create-title">Post Title</label>
              <input
                id="post-create-title"
                name="title"
                type="text"
                placeholder="Example: New patch changed ranked recoil patterns"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="post-create-body">Post Body</label>
              <textarea
                id="post-create-body"
                name="body"
                placeholder="Share details, context, and your recommendation for other players..."
                required
              />
            </div>

            <TagEditor placeholder="Add a tag like Ranked" />

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

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import SearchableHubSelect from "../components/SearchableHubSelect";
import TagEditor from "../components/TagEditor";
import Spinner from "../components/Spinner";
import { api } from "../api/client";
import type { GameHub, Post, PostStatus, ApiError } from "../api/types";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/useAuth";

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === "AbortError";
}

export default function EditPostPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { user } = useAuth();

  const [post, setPost] = useState<Post | null>(null);
  const [gameHubs, setGameHubs] = useState<GameHub[]>([]);
  const [selectedHubId, setSelectedHubId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hubOptions = gameHubs.map((hub) => ({
    value: String(hub.id),
    label: hub.name,
    keywords: [hub.slug],
  }));

  const hubsEndpoint =
    user?.role === "developer" ? "/developer/gamehubs" : "/gamehubs";

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    api
      .get<GameHub[]>(hubsEndpoint, signal)
      .then(({ status, data }) => {
        if (status === 200 && Array.isArray(data)) setGameHubs(data);
      })
      .catch((err: unknown) => {
        if (!isAbortError(err)) setSubmitError("Failed to load game hubs");
      });

    if (postId) {
      api.get<Post | ApiError>(`/posts/${postId}`, signal).then(({ status, data }) => {
        if (status === 200) {
          const nextPost = data as Post;
          setPost(nextPost);
          setSelectedHubId(String(nextPost.game_hub.id));
        } else {
          navigate(`/error/${status || 404}`, { replace: true });
        }
      }).catch((err: unknown) => {
        if (!isAbortError(err)) navigate("/error/404", { replace: true });
      });
    }

    return () => controller.abort();
  }, [navigate, postId, hubsEndpoint]);

  async function handleSubmit(
    e: { preventDefault(): void; currentTarget: HTMLFormElement },
    status: PostStatus
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    const gameHubId = parseInt(selectedHubId, 10);
    const title = (form.elements.namedItem("title") as HTMLInputElement).value;
    const body = (form.elements.namedItem("body") as HTMLTextAreaElement).value;
    const tagsRaw = (form.elements.namedItem("tags") as HTMLInputElement).value;
    const tags = tagsRaw ? tagsRaw.split(",").filter(Boolean) : [];
    const isQuestion = (
      form.elements.namedItem("is_question") as HTMLInputElement
    ).checked;
    const hasSpoilers = (
      form.elements.namedItem("contains_spoilers") as HTMLInputElement
    ).checked;

    if (Number.isNaN(gameHubId)) {
      const errMsg = "Select a forum before saving.";
      setSubmitError(errMsg);
      addToast(errMsg, "error");
      return;
    }

    setSubmitError(null);
    setSubmitting(true);
    const { status: resStatus, data } = await api.put<Post | ApiError>(
      `/posts/${postId}`,
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

    if (resStatus === 200) {
      addToast("Post updated!", "success");
      navigate("/my-posts");
    } else {
      const errMsg = (data as ApiError).error ?? "Failed to save post";
      setSubmitError(errMsg);
      addToast(errMsg, "error");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this post? This cannot be undone.")) return;
    const { status } = await api.delete<unknown>(`/posts/${postId}`);
    if (status === 200) {
      addToast("Post deleted", "success");
      navigate("/my-posts");
    } else {
      addToast("Failed to delete post", "error");
    }
  }

  if (!post) {
    return (
      <Layout>
        <main className="page-grid">
          <section className="hero-card">
            <Spinner text="Loading post…" />
          </section>
        </main>
      </Layout>
    );
  }

  return (
    <Layout>
      <main className="page-grid">
        <section className="hero-card">
          <span className="eyebrow">Arcade Garage</span>
          <h1 className="headline">Edit Post</h1>
          <p className="subhead">
            Update an existing thread with the same clean form used for
            creation.
          </p>
        </section>

        <section className="form-card">
          <p className="panel-tag">Post Studio</p>
          <h2 className="section-title">Edit Existing Post</h2>
          <p className="helper">
            The form is prefilled so you can update and republish or save a
            draft.
          </p>

          <form
            className="form-fields"
            onSubmit={(e) => {
              const btn = (e.nativeEvent as SubmitEvent)
                .submitter as HTMLButtonElement | null;
              handleSubmit(e, (btn?.value ?? "published") as PostStatus);
            }}
          >
            {submitError && <p className="form-error">{submitError}</p>}

            <div className="field">
              <label htmlFor="post-edit-forum">Forum</label>
              <SearchableHubSelect
                id="post-edit-forum"
                name="game_hub_id"
                value={selectedHubId}
                options={hubOptions}
                disabled={gameHubs.length === 0}
                onChange={setSelectedHubId}
              />
            </div>

            <div className="field">
              <label htmlFor="post-edit-title">Post Title</label>
              <input
                id="post-edit-title"
                name="title"
                type="text"
                defaultValue={post?.title ?? ""}
                key={post?.id}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="post-edit-body">Post Body</label>
              <textarea
                id="post-edit-body"
                name="body"
                required
                defaultValue={post?.body ?? ""}
                key={post?.id}
              />
            </div>

            <TagEditor
              key={post?.id}
              initialTags={post?.tags.map((t) => t.name) ?? []}
              placeholder="Add a tag"
              hint="Update the tags if the thread focus changes."
            />

            <div className="check-grid">
              <label className="check">
                <input
                  name="is_question"
                  type="checkbox"
                  defaultChecked={post?.is_question}
                  key={post?.id}
                />
                <span>Keep this post marked as a question.</span>
              </label>
              <label className="check">
                <input
                  name="contains_spoilers"
                  type="checkbox"
                  defaultChecked={post?.has_spoilers}
                  key={post?.id}
                />
                <span>This post contains spoilers.</span>
              </label>
            </div>

            <div className="meta-row">
              <div className="action-row">
                <button
                  className="btn primary"
                  type="submit"
                  name="status"
                  value="published"
                  disabled={submitting}
                >
                  {submitting ? "Saving…" : "Save Changes"}
                </button>
                <button
                  className="btn secondary"
                  type="submit"
                  name="status"
                  value="draft"
                  disabled={submitting}
                >
                  Save Draft
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => navigate("/my-posts")}
                >
                  Discard
                </button>
              </div>
              <button
                className="danger-link"
                type="button"
                onClick={handleDelete}
              >
                Delete Post
              </button>
            </div>
          </form>

          <p className="inline-copy">
            <Link className="text-link" to="/my-posts">
              Back to My Posts
            </Link>
            .
          </p>
        </section>
      </main>
    </Layout>
  );
}

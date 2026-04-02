import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import TagEditor from "../components/TagEditor";
import { api } from "../api/client";
import type { GameHub, Post, PostStatus, ApiError } from "../api/types";

export default function EditPostPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();

  const [post, setPost] = useState<Post | null>(null);
  const [gameHubs, setGameHubs] = useState<GameHub[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    api.get<GameHub[]>("/gamehubs", signal).then(({ data }) => setGameHubs(data));

    if (postId) {
      api.get<Post | ApiError>(`/posts/${postId}`, signal).then(({ status, data }) => {
        if (status === 200) {
          setPost(data as Post);
        } else {
          setLoadError((data as ApiError).error ?? "Post not found");
        }
      });
    }

    return () => controller.abort();
  }, [postId]);

  async function handleSubmit(
    e: { preventDefault(): void; currentTarget: HTMLFormElement },
    status: PostStatus,
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    const title = (form.elements.namedItem("title") as HTMLInputElement).value;
    const body = (form.elements.namedItem("body") as HTMLTextAreaElement).value;
    const tagsRaw = (form.elements.namedItem("tags") as HTMLInputElement).value;
    const tags = tagsRaw ? tagsRaw.split(",").filter(Boolean) : [];
    const isQuestion = (form.elements.namedItem("is_question") as HTMLInputElement).checked;
    const hasSpoilers = (form.elements.namedItem("contains_spoilers") as HTMLInputElement).checked;

    setSubmitError(null);
    setSubmitting(true);
    const { status: resStatus, data } = await api.put<Post | ApiError>(`/posts/${postId}`, {
      title,
      body,
      tags,
      is_question: isQuestion,
      has_spoilers: hasSpoilers,
      status,
    });
    setSubmitting(false);

    if (resStatus === 200) {
      setPost(data as Post);
    } else {
      setSubmitError((data as ApiError).error ?? "Failed to save post");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this post? This cannot be undone.")) return;
    const { status } = await api.delete<unknown>(`/posts/${postId}`);
    if (status === 200) {
      navigate("/posts");
    }
  }

  if (loadError) {
    return (
      <Layout>
        <main className="page-grid">
          <section className="hero-card">
            <h1 className="headline">Post Not Found</h1>
            <p className="subhead">{loadError}</p>
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
            Update an existing thread with the same clean form used for creation.
          </p>
        </section>

        <section className="form-card">
          <p className="panel-tag">Post Studio</p>
          <h2 className="section-title">Edit Existing Post</h2>
          <p className="helper">
            The form is prefilled so you can update and republish or save a draft.
          </p>

          <form
            className="form-fields"
            onSubmit={(e) => {
              const btn = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
              handleSubmit(e, (btn?.value ?? "published") as PostStatus);
            }}
          >
            {submitError && <p className="form-error">{submitError}</p>}

            <div className="field">
              <label htmlFor="post-edit-forum">Forum</label>
              <select
                id="post-edit-forum"
                name="game_hub_id"
                key={post?.id}
                defaultValue={post?.game_hub.id}
              >
                {gameHubs.map((hub) => (
                  <option key={hub.id} value={hub.id}>
                    {hub.name}
                  </option>
                ))}
              </select>
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
                  onClick={() => navigate(-1)}
                >
                  Discard
                </button>
              </div>
              <button className="danger-link" type="button" onClick={handleDelete}>
                Delete Post
              </button>
            </div>
          </form>

          <p className="inline-copy">
            <Link className="text-link" to="/posts">
              Back to feed
            </Link>
            .
          </p>
        </section>
      </main>
    </Layout>
  );
}

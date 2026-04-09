import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { ApiError, Post, PostComment } from "../api/types";

interface PostCommentsProps {
  post: Post;
  canComment: boolean;
  expandedByDefault?: boolean;
  onCommentCreated?: () => void;
}

export default function PostComments({
  post,
  canComment,
  expandedByDefault = false,
  onCommentCreated,
}: PostCommentsProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(expandedByDefault);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [body, setBody] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadComments = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const { status, data } = await api.get<PostComment[] | ApiError>(`/posts/${post.id}/comments`);
    setLoading(false);

    if (status === 200) {
      setComments(data as PostComment[]);
      setCommentCount((data as PostComment[]).length);
      setHasLoaded(true);
      return;
    }

    setLoadError((data as ApiError).error ?? "Failed to load comments");
  }, [post.id]);

  useEffect(() => {
    if (expandedByDefault && !hasLoaded) {
      const timer = window.setTimeout(() => {
        void loadComments();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [expandedByDefault, hasLoaded, loadComments]);

  async function handleToggle() {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen && !hasLoaded) {
      await loadComments();
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canComment) {
      navigate("/login");
      return;
    }

    const cleanedBody = body.trim();
    if (!cleanedBody) {
      setSubmitError("Comment text is required");
      return;
    }

    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("attachment") as HTMLInputElement | null;
    const attachment = fileInput?.files?.[0];
    const formData = new FormData();
    formData.set("body", cleanedBody);
    if (attachment) {
      formData.set("attachment", attachment);
    }

    setSubmitting(true);
    setSubmitError(null);
    const { status, data } = await api.post<PostComment | ApiError>(
      `/posts/${post.id}/comments`,
      formData,
    );
    setSubmitting(false);

    if (status === 201) {
      const createdComment = data as PostComment;
      setComments((currentComments) => [...currentComments, createdComment]);
      setCommentCount((currentCount) => currentCount + 1);
      setHasLoaded(true);
      setBody("");
      setAttachmentName("");
      form.reset();
      onCommentCreated?.();
      return;
    }

    if (status === 401) {
      navigate("/login");
      return;
    }

    setSubmitError((data as ApiError).error ?? "Failed to post comment");
  }

  return (
    <section className="comment-panel">
      <div className="comment-header">
        <button className="action-link text-link" type="button" onClick={handleToggle}>
          {isOpen ? "Hide comments" : "Comments"} ({commentCount})
        </button>
        <span className="helper compact">
          {commentCount === 0 ? "Start the first reply." : "Discuss the thread here."}
        </span>
      </div>

      {isOpen && (
        <div className="comment-stack">
          {loading ? (
            <p className="helper compact">Loading comments…</p>
          ) : loadError ? (
            <p className="form-error">{loadError}</p>
          ) : comments.length === 0 ? (
            <p className="helper compact">No comments yet.</p>
          ) : (
            <div className="comment-list">
              {comments.map((comment) => (
                <article className="comment-card" key={comment.id}>
                  <div className="comment-meta">
                    <span>{comment.author.username}</span>
                    <span>{new Date(comment.created_at).toLocaleString()}</span>
                  </div>
                  <p className="comment-copy">{comment.body}</p>
                  {comment.attachment_url && (
                    <a
                      className="comment-attachment"
                      href={comment.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open {comment.attachment_name ?? "attachment"}
                    </a>
                  )}
                </article>
              ))}
            </div>
          )}

          {canComment ? (
            <form className="comment-form" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor={`comment-body-${post.id}`}>Add Comment</label>
                <textarea
                  id={`comment-body-${post.id}`}
                  name="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Share a build note, counterpoint, or strategy tip..."
                  required
                />
              </div>

              <div className="comment-form-row">
                <label className="comment-file">
                  <span className="comment-file-label">Optional Attachment</span>
                  <input
                    name="attachment"
                    type="file"
                    onChange={(e) => setAttachmentName(e.target.files?.[0]?.name ?? "")}
                  />
                </label>
                <span className="helper compact">
                  {attachmentName || "Attach a screenshot, notes file, or clip."}
                </span>
              </div>

              {submitError && <p className="form-error">{submitError}</p>}

              <div className="comment-actions">
                <button className="btn secondary" type="submit" disabled={submitting}>
                  {submitting ? "Posting…" : "Post Comment"}
                </button>
              </div>
            </form>
          ) : (
            <p className="helper compact">
              Log in to join the discussion and add attachments.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

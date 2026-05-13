import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type {
  ApiError,
  CommentModerationReport,
  Post,
  PostComment,
} from "../api/types";
import { useToast } from "../context/ToastContext";

interface PostCommentsProps {
  post: Post;
  canComment: boolean;
  currentUserId?: number | null;
  expandedByDefault?: boolean;
  onCommentCreated?: () => void;
}

export default function PostComments({
  post,
  canComment,
  currentUserId = null,
  expandedByDefault = false,
  onCommentCreated,
}: PostCommentsProps) {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [isOpen, setIsOpen] = useState(expandedByDefault);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [body, setBody] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reportingCommentId, setReportingCommentId] = useState<number | null>(null);
  const [openReportCommentId, setOpenReportCommentId] = useState<number | null>(null);
  const [reportReasons, setReportReasons] = useState<Record<number, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
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

  async function handleReport(comment: PostComment) {
    if (!canComment) {
      navigate("/login");
      return;
    }

    const reason = reportReasons[comment.id]?.trim() ?? "";
    if (!reason) {
      const message = "Report reason is required";
      setLoadError(message);
      addToast(message, "error");
      return;
    }

    setReportingCommentId(comment.id);
    setLoadError(null);

    const { status, data } = await api.post<CommentModerationReport | ApiError>(
      `/comments/${comment.id}/reports`,
      { reason },
    );
    setReportingCommentId(null);

    if (status === 201) {
      setOpenReportCommentId(null);
      setReportReasons((current) => {
        const next = { ...current };
        delete next[comment.id];
        return next;
      });
      addToast("Comment reported for moderator review", "success");
      return;
    }

    if (status === 401) {
      navigate("/login");
      return;
    }

    const message = (data as ApiError).error ?? "Failed to submit report";
    setLoadError(message);
    addToast(message, "error");
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
                  <div className="comment-card-head">
                    <div className="comment-meta">
                      <span>{comment.author.username}</span>
                      <span>{new Date(comment.created_at).toLocaleString()}</span>
                    </div>
                    {currentUserId !== comment.author.id && (
                      <button
                        className="action-link text-link"
                        type="button"
                        onClick={() =>
                          setOpenReportCommentId((current) =>
                            current === comment.id ? null : comment.id,
                          )
                        }
                      >
                        {openReportCommentId === comment.id ? "Cancel Report" : "Report"}
                      </button>
                    )}
                  </div>
                  <p className="comment-copy">{comment.body}</p>
                  {comment.attachment_url && (
                    <a
                      className="comment-attachment"
                      href={comment.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        className="comment-attachment-image"
                        src={comment.attachment_url}
                        alt={comment.attachment_name ?? "attachment"}
                      />
                    </a>
                  )}
                  {openReportCommentId === comment.id ? (
                    <div className="report-panel comment-report-panel">
                      <h4 className="report-title">Report Comment</h4>
                      <p className="helper">
                        Explain why this comment needs moderator attention.
                      </p>
                      <div className="field">
                        <label htmlFor={`comment-report-reason-${comment.id}`}>Report Reason</label>
                        <textarea
                          id={`comment-report-reason-${comment.id}`}
                          rows={3}
                          value={reportReasons[comment.id] ?? ""}
                          onChange={(event) =>
                            setReportReasons((current) => ({
                              ...current,
                              [comment.id]: event.target.value,
                            }))
                          }
                          placeholder="Spam, harassment, spoilers without warning, or another issue"
                        />
                      </div>
                      <div className="report-actions">
                        <button
                          className="btn secondary"
                          type="button"
                          disabled={reportingCommentId === comment.id}
                          onClick={() => handleReport(comment)}
                        >
                          {reportingCommentId === comment.id ? "Submitting…" : "Submit Report"}
                        </button>
                        <button
                          className="btn ghost"
                          type="button"
                          disabled={reportingCommentId === comment.id}
                          onClick={() => setOpenReportCommentId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
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
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      setAttachmentName(file?.name ?? "");
                      if (previewUrl) URL.revokeObjectURL(previewUrl);
                      setPreviewUrl(file ? URL.createObjectURL(file) : null);
                    }}
                  />
                </label>
                <span className="helper compact">
                  {attachmentName || "Attach a screenshot, notes file, or clip."}
                </span>
              </div>

              {previewUrl && (
                <a
                  className="comment-attachment"
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    className="comment-attachment-image"
                    src={previewUrl}
                    alt={attachmentName || "attachment preview"}
                  />
                </a>
              )}

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

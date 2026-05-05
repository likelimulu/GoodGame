import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import Spinner from "../components/Spinner";
import { api } from "../api/client";
import type {
  ApiError,
  ModerationActionType,
  ModerationQueueItem,
  ModerationReportStatus,
} from "../api/types";
import { useToast } from "../context/ToastContext";

type QueueFilter = ModerationReportStatus | "all";

const FILTER_OPTIONS: Array<{ value: QueueFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "escalated", label: "Escalated" },
  { value: "actioned", label: "Actioned" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

const ACTION_LABELS: Record<ModerationActionType, string> = {
  warn: "Warn Author",
  remove: "Remove Post",
  escalate: "Escalate",
  dismiss: "Dismiss Report",
};

function formatDate(value: string | null) {
  if (!value) return "No timestamp yet";
  return new Date(value).toLocaleString();
}

function isActionable(status: ModerationReportStatus) {
  return status === "open" || status === "escalated";
}

function getQueueStatusClass(status: ModerationReportStatus) {
  return `queue-status queue-status-${status}`;
}

function getActionToast(action: ModerationActionType) {
  if (action === "warn") return "Author warned and report resolved";
  if (action === "remove") return "Post removed from the public feed";
  if (action === "escalate") return "Post escalated for higher-level review";
  return "Report dismissed";
}

export default function ModeratorWorkspacePage() {
  const { addToast } = useToast();
  const [filter, setFilter] = useState<QueueFilter>("open");
  const [items, setItems] = useState<ModerationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyPostId, setBusyPostId] = useState<number | null>(null);
  const [actionNotes, setActionNotes] = useState<Record<number, string>>({});

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const query = filter === "all" ? "/moderation/queue?status=all" : `/moderation/queue?status=${filter}`;

    api
      .get<ModerationQueueItem[] | ApiError>(query, controller.signal)
      .then(({ status, data }) => {
        if (cancelled) return;
        if (status === 200 && Array.isArray(data)) {
          setItems(data);
          return;
        }
        setError((data as ApiError).error ?? "Failed to load moderation queue");
      })
      .catch((err) => {
        if (!cancelled && err.name !== "AbortError") {
          setError("Failed to load moderation queue");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [filter]);

  const summary = useMemo(() => {
    const escalatedCount = items.filter((item) => item.report_status === "escalated").length;
    const repeatedCount = items.filter((item) => item.report_count >= 2).length;
    const spoilerCount = items.filter((item) => item.has_spoilers).length;
    const removedCount = items.filter(
      (item) => item.status === "deleted" || item.latest_action === "remove"
    ).length;

    return {
      total: items.length,
      escalated: escalatedCount,
      repeated: repeatedCount,
      spoilers: spoilerCount,
      removed: removedCount,
    };
  }, [items]);

  async function handleAction(item: ModerationQueueItem, action: ModerationActionType) {
    setBusyPostId(item.id);
    setError(null);

    const { status, data } = await api.post<ModerationQueueItem | ApiError>(
      `/moderation/posts/${item.id}/actions`,
      {
        action,
        note: actionNotes[item.id]?.trim() ?? "",
      }
    );

    setBusyPostId(null);

    if (status === 200) {
      const updatedItem = data as ModerationQueueItem;
      setItems((current) => {
        if (filter !== "all" && updatedItem.report_status !== filter) {
          return current.filter((entry) => entry.id !== item.id);
        }
        return current.map((entry) => (entry.id === item.id ? updatedItem : entry));
      });
      setActionNotes((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      addToast(getActionToast(action), "success");
      return;
    }

    const message = (data as ApiError).error ?? "Failed to apply moderation action";
    setError(message);
    addToast(message, "error");
  }

  function handleFilterChange(nextFilter: QueueFilter) {
    if (nextFilter === filter) return;
    setLoading(true);
    setError(null);
    setFilter(nextFilter);
  }

  return (
    <Layout>
      <main className="page-grid moderator-grid">
        <section className="hero-card">
          <span className="eyebrow">Control Room</span>
          <h1 className="headline">Moderator Queue</h1>
          <p className="subhead">
            Separate workspace for flagged threads, moderation decisions, and queue triage.
          </p>

          <div className="feed-sidebar-stack">
            <p className="helper moderator-hero-copy">
              The moderation workflow stays outside the regular user feed. Reported content
              lands here first, and moderators can warn, remove, dismiss, or escalate without
              exposing moderation controls to normal users.
            </p>

            <div className="moderator-summary-grid">
              <article className="moderator-summary-card">
                <span className="panel-tag">Visible Queue</span>
                <p className="moderator-summary-value">{summary.total}</p>
              </article>
              <article className="moderator-summary-card">
                <span className="panel-tag">Escalated</span>
                <p className="moderator-summary-value">{summary.escalated}</p>
              </article>
              <article className="moderator-summary-card">
                <span className="panel-tag">Repeat Reports</span>
                <p className="moderator-summary-value">{summary.repeated}</p>
              </article>
              <article className="moderator-summary-card">
                <span className="panel-tag">Removed</span>
                <p className="moderator-summary-value">{summary.removed}</p>
              </article>
            </div>
          </div>
        </section>

        <section className="form-card feed-card">
          <p className="panel-tag">Moderator Workspace</p>
          <h2 className="section-title">Flagged Content Queue</h2>
          <p className="helper">
            Filter by queue state, review the report context, then take the moderation action
            directly from this page.
          </p>

          <div className="filter-row">
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={`btn ${filter === option.value ? "secondary" : "ghost"}`}
                type="button"
                onClick={() => handleFilterChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {error && <p className="form-error">{error}</p>}

          {loading ? (
            <div className="feed-empty-state">
              <Spinner text="Loading moderation queue…" />
            </div>
          ) : items.length === 0 ? (
            <div className="feed-empty-state">
              <h3 className="empty-title">Queue Clear</h3>
              <p className="helper">
                There are no posts in the {filter} queue right now.
              </p>
            </div>
          ) : (
            <div className="moderator-card-grid">
              <section className="moderator-panel">
                <div className="moderator-panel-head">
                  <div>
                    <h3 className="moderator-panel-title">Reported Posts</h3>
                    <p className="helper">
                      Queue items are ordered by the newest report activity so urgent issues
                      stay near the top.
                    </p>
                  </div>
                  <span className="pill moderator-pill">{items.length} visible</span>
                </div>

                <div className="moderator-list">
                  {items.map((item) => {
                    const busy = busyPostId === item.id;
                    const note = actionNotes[item.id] ?? "";
                    const actionable = isActionable(item.report_status);
                    return (
                      <article className="moderator-item" key={item.id}>
                        <div className="moderator-item-head">
                          <div>
                            <h4 className="moderator-item-title">{item.title}</h4>
                            <div className="moderator-item-meta">
                              <span>{item.game_hub.name}</span>
                              <span>by {item.author.username}</span>
                              <span>Updated {formatDate(item.updated_at)}</span>
                            </div>
                          </div>

                          <div className="moderator-pill-stack">
                            <span className={getQueueStatusClass(item.report_status)}>
                              {item.report_status}
                            </span>
                            <span className="pill moderator-score-pill">
                              {item.report_count} reports
                            </span>
                          </div>
                        </div>

                        <p className="moderator-item-copy">{item.body}</p>

                        <div className="post-badges">
                          {item.is_question && <span className="pill pill-question">Question</span>}
                          {item.has_spoilers && <span className="pill pill-warning">Spoilers</span>}
                          {item.tags.map((tag) => (
                            <span className="tag" key={tag.id}>
                              {tag.name}
                            </span>
                          ))}
                        </div>

                        <div className="moderator-report-meta">
                          <p className="moderator-report-copy">
                            Latest report: {item.latest_report_reason ?? "No reason recorded."}
                          </p>
                          <p className="helper">
                            Reported {formatDate(item.latest_reported_at)}
                          </p>
                          {item.latest_action ? (
                            <p className="helper">
                              Latest action: {item.latest_action}{" "}
                              {item.latest_action_at ? `· ${formatDate(item.latest_action_at)}` : ""}
                            </p>
                          ) : null}
                          {item.latest_action_note ? (
                            <p className="helper">Last note: {item.latest_action_note}</p>
                          ) : null}
                        </div>

                        {actionable ? (
                          <>
                            <div className="field moderation-note-field">
                              <label htmlFor={`moderation-note-${item.id}`}>Moderator Note</label>
                              <textarea
                                id={`moderation-note-${item.id}`}
                                rows={3}
                                placeholder="Add context for this moderation action"
                                value={note}
                                onChange={(event) =>
                                  setActionNotes((current) => ({
                                    ...current,
                                    [item.id]: event.target.value,
                                  }))
                                }
                              />
                              <p className="helper compact">
                                Warn/remove notes are included in author notifications.
                                Escalate/dismiss notes stay internal.
                              </p>
                            </div>

                            <div className="moderation-action-grid">
                              {(["warn", "remove", "escalate", "dismiss"] as ModerationActionType[]).map(
                                (action) => (
                                  <button
                                    key={action}
                                    className={`btn ${action === "remove" ? "ghost" : "secondary"}`}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => handleAction(item, action)}
                                  >
                                    {busy ? "Saving…" : ACTION_LABELS[action]}
                                  </button>
                                )
                              )}
                              <Link className="btn ghost" to="/posts">
                                Open Community Feed
                              </Link>
                            </div>
                          </>
                        ) : (
                          <div className="moderator-action-row">
                            <span className="helper">
                              This item is already {item.report_status}. Use the queue filter to
                              focus on unresolved reports.
                            </span>
                            <Link className="btn ghost" to="/posts">
                              Open Community Feed
                            </Link>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>

              <div className="moderator-side-column">
                <section className="moderator-panel">
                  <div className="moderator-panel-head">
                    <div>
                      <h3 className="moderator-panel-title">Action Guide</h3>
                      <p className="helper">
                        Keep action semantics visible so the queue stays consistent across mods.
                      </p>
                    </div>
                  </div>

                  <ul className="rule-list">
                    <li>Warn keeps the post live and resolves the current report set.</li>
                    <li>Remove soft-deletes the post and clears the active report queue.</li>
                    <li>Escalate keeps the item visible for higher-level moderation review.</li>
                    <li>Dismiss closes the report without changing the underlying post.</li>
                  </ul>
                </section>

                <section className="moderator-panel">
                  <div className="moderator-panel-head">
                    <div>
                      <h3 className="moderator-panel-title">Queue Notes</h3>
                      <p className="helper">
                        These are the live moderation signals coming from reported content.
                      </p>
                    </div>
                  </div>

                  <div className="moderator-limit-list">
                    <p className="helper">Spoiler-tagged posts in view: {summary.spoilers}</p>
                    <p className="helper">Escalated items require follow-up by senior staff.</p>
                    <p className="helper">Admin role approvals stay on the admin request page.</p>
                  </div>
                </section>
              </div>
            </div>
          )}
        </section>
      </main>
    </Layout>
  );
}

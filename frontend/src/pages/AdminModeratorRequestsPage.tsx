import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import Spinner from "../components/Spinner";
import { api } from "../api/client";
import type { ApiError, ModeratorAccessRequest } from "../api/types";
import { useToast } from "../context/ToastContext";

type RequestFilter = "pending" | "approved" | "rejected" | "all";
type ReviewDecision = "approved" | "rejected";

const FILTER_OPTIONS: Array<{ value: RequestFilter; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

function formatDate(value: string | null) {
  if (!value) return "Not reviewed yet";
  return new Date(value).toLocaleString();
}

export default function AdminModeratorRequestsPage() {
  const { addToast } = useToast();
  const [filter, setFilter] = useState<RequestFilter>("pending");
  const [requests, setRequests] = useState<ModeratorAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const query =
      filter === "all" ? "/moderator-requests" : `/moderator-requests?status=${filter}`;

    api
      .get<ModeratorAccessRequest[] | ApiError>(query, controller.signal)
      .then(({ status, data }) => {
        if (cancelled) return;
        if (status === 200 && Array.isArray(data)) {
          setRequests(data);
          return;
        }
        setError((data as ApiError).error ?? "Failed to load moderator requests");
      })
      .catch((err) => {
        if (!cancelled && err.name !== "AbortError") {
          setError("Failed to load moderator requests");
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

  const pendingCount = useMemo(
    () => requests.filter((request) => request.status === "pending").length,
    [requests]
  );

  async function handleReview(request: ModeratorAccessRequest, status: ReviewDecision) {
    setBusyRequestId(request.id);
    setError(null);

    const { data, status: responseStatus } = await api.put<ModeratorAccessRequest | ApiError>(
      `/moderator-requests/${request.id}`,
      {
        status,
        review_note: reviewNotes[request.id]?.trim() ?? "",
      }
    );

    setBusyRequestId(null);

    if (responseStatus === 200) {
      const updatedRequest = data as ModeratorAccessRequest;
      setRequests((current) => {
        if (filter === "pending") {
          return current.filter((entry) => entry.id !== request.id);
        }
        return current.map((entry) => (entry.id === request.id ? updatedRequest : entry));
      });
      setReviewNotes((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
      addToast(
        status === "approved"
          ? `${request.user.username} approved as moderator`
          : `${request.user.username} request rejected`,
        "success"
      );
      return;
    }

    const message = (data as ApiError).error ?? "Failed to review moderator request";
    setError(message);
    addToast(message, "error");
  }

  function handleFilterChange(nextFilter: RequestFilter) {
    if (nextFilter === filter) return;
    setLoading(true);
    setError(null);
    setFilter(nextFilter);
  }

  return (
    <Layout>
      <main className="page-grid admin-grid">
        <section className="hero-card">
          <span className="eyebrow">Admin Queue</span>
          <h1 className="headline">Moderator Requests</h1>
          <p className="subhead">
            Review role-elevation requests without exposing moderator tools to regular users.
          </p>

          <div className="feed-sidebar-stack">
            <p className="helper">
              Pending requests stay blocked until an admin approves them. Approval promotes the
              user role to moderator.
            </p>
            <div className="admin-summary-grid">
              <article className="admin-summary-card">
                <span className="panel-tag">Current Filter</span>
                <p className="admin-summary-value">{filter}</p>
              </article>
              <article className="admin-summary-card">
                <span className="panel-tag">Visible Pending</span>
                <p className="admin-summary-value">{pendingCount}</p>
              </article>
            </div>
          </div>
        </section>

        <section className="form-card feed-card">
          <p className="panel-tag">Access Reviews</p>
          <h2 className="section-title">Approval Queue</h2>
          <p className="helper">
            Review requests, leave an internal note if needed, then approve or reject the access
            change.
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
              <Spinner text="Loading moderator requests…" />
            </div>
          ) : requests.length === 0 ? (
            <div className="feed-empty-state">
              <h3 className="empty-title">No requests</h3>
              <p className="helper">
                There are no moderator access requests in the {filter} queue right now.
              </p>
            </div>
          ) : (
            <div className="request-list">
              {requests.map((request) => {
                const reviewNote = reviewNotes[request.id] ?? "";
                const busy = busyRequestId === request.id;
                return (
                  <article className="request-card" key={request.id}>
                    <div className="request-head">
                      <div>
                        <h3 className="request-title">{request.user.username}</h3>
                        <p className="request-subtitle">
                          {request.user.email} · current role: {request.user.role}
                        </p>
                      </div>
                      <span className={`pill request-status request-status-${request.status}`}>
                        {request.status}
                      </span>
                    </div>

                    <div className="request-meta">
                      <span>Requested: {formatDate(request.requested_at)}</span>
                      <span>Reviewed: {formatDate(request.reviewed_at)}</span>
                      {request.reviewed_by_username ? (
                        <span>Reviewed by: {request.reviewed_by_username}</span>
                      ) : null}
                    </div>

                    <div className="request-detail">
                      <p className="request-detail-label">Request Reason</p>
                      <p className="request-detail-copy">
                        {request.reason || "No reason provided by the requester."}
                      </p>
                    </div>

                    {request.status === "pending" ? (
                      <>
                        <div className="field">
                          <label htmlFor={`review-note-${request.id}`}>Internal Review Note</label>
                          <textarea
                            id={`review-note-${request.id}`}
                            value={reviewNote}
                            rows={3}
                            placeholder="Optional context for approval or rejection"
                            onChange={(event) =>
                              setReviewNotes((current) => ({
                                ...current,
                                [request.id]: event.target.value,
                              }))
                            }
                          />
                        </div>

                        <div className="action-row">
                          <button
                            className="btn secondary"
                            type="button"
                            disabled={busy}
                            onClick={() => handleReview(request, "approved")}
                          >
                            {busy ? "Saving…" : "Approve Request"}
                          </button>
                          <button
                            className="btn ghost"
                            type="button"
                            disabled={busy}
                            onClick={() => handleReview(request, "rejected")}
                          >
                            {busy ? "Saving…" : "Reject Request"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="request-detail">
                        <p className="request-detail-label">Review Note</p>
                        <p className="request-detail-copy">
                          {request.review_note || "No review note recorded."}
                        </p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </Layout>
  );
}

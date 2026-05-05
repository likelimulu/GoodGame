import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import Spinner from "../components/Spinner";
import { api } from "../api/client";
import type { ApiError, Notification as UserNotification, NotificationType } from "../api/types";
import { useToast } from "../context/ToastContext";

const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  moderation_warning: "Warning",
  post_removed: "Post Removed",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function getPostReference(notification: UserNotification) {
  if (!notification.post_id || !notification.post_title) {
    return "Related post is no longer available.";
  }

  if (notification.post_status === "deleted") {
    return `Removed post: ${notification.post_title} (#${notification.post_id}). No public link is available.`;
  }

  return `Post: ${notification.post_title} (#${notification.post_id})`;
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyNotificationId, setBusyNotificationId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    api
      .get<UserNotification[] | ApiError>("/notifications", controller.signal)
      .then(({ status, data }) => {
        if (cancelled) return;
        if (status === 200 && Array.isArray(data)) {
          setNotifications(data);
          return;
        }
        if (status === 401) {
          navigate("/login", { replace: true });
          return;
        }
        setError((data as ApiError).error ?? "Failed to load notifications");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Failed to load notifications");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [navigate]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications],
  );

  async function handleMarkRead(notification: UserNotification) {
    setBusyNotificationId(notification.id);
    setError(null);

    const { status, data } = await api.post<UserNotification | ApiError>(
      `/notifications/${notification.id}/read`,
      {},
    );

    setBusyNotificationId(null);

    if (status === 200) {
      const updatedNotification = data as UserNotification;
      setNotifications((current) =>
        current.map((entry) =>
          entry.id === updatedNotification.id ? updatedNotification : entry,
        ),
      );
      addToast("Notification marked as read", "success");
      return;
    }

    if (status === 401) {
      navigate("/login", { replace: true });
      return;
    }

    const message = (data as ApiError).error ?? "Failed to update notification";
    setError(message);
    addToast(message, "error");
  }

  return (
    <Layout>
      <main className="page-grid feed-grid">
        <section className="hero-card">
          <span className="eyebrow">Inbox</span>
          <h1 className="headline">Notifications</h1>
          <p className="subhead">
            Review moderation messages about your GoodGame posts.
          </p>

          <div className="feed-sidebar-stack">
            <div className="moderator-summary-grid">
              <article className="moderator-summary-card">
                <span className="panel-tag">Unread</span>
                <p className="moderator-summary-value">{unreadCount}</p>
              </article>
              <article className="moderator-summary-card">
                <span className="panel-tag">Total</span>
                <p className="moderator-summary-value">{notifications.length}</p>
              </article>
            </div>
            <p className="helper moderator-hero-copy">
              Warnings and removed-post notices appear here. Report activity and internal
              moderator workflow changes are not shown in this inbox.
            </p>
          </div>
        </section>

        <section className="form-card feed-card">
          <p className="panel-tag">User Notifications</p>
          <h2 className="section-title">Your Inbox</h2>
          <p className="helper">
            Notifications are tied to your account and can be marked read after review.
          </p>

          {error && <p className="form-error">{error}</p>}

          {loading ? (
            <div className="feed-empty-state">
              <Spinner text="Loading notifications…" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="feed-empty-state">
              <h3 className="empty-title">No notifications</h3>
              <p className="helper">
                You have no moderation notifications right now.
              </p>
            </div>
          ) : (
            <div className="notification-list">
              {notifications.map((notification) => (
                <article
                  className={`notification-card${notification.is_read ? "" : " unread"}`}
                  key={notification.id}
                >
                  <div className="notification-head">
                    <div>
                      <div className="notification-meta">
                        <span className="post-hub">{NOTIFICATION_LABELS[notification.type]}</span>
                        <span>{formatDate(notification.created_at)}</span>
                      </div>
                      <h3 className="notification-title">{notification.title}</h3>
                    </div>
                    <span className={notification.is_read ? "queue-status queue-status-actioned" : "queue-status queue-status-open"}>
                      {notification.is_read ? "read" : "unread"}
                    </span>
                  </div>

                  <p className="notification-message">{notification.message}</p>
                  <p className="notification-reference">{getPostReference(notification)}</p>

                  <div className="notification-actions">
                    <span className="helper compact">
                      {notification.actor_username
                        ? `Actioned by ${notification.actor_username}`
                        : "Actioned by GoodGame moderation"}
                    </span>
                    {!notification.is_read && (
                      <button
                        className="btn secondary"
                        type="button"
                        disabled={busyNotificationId === notification.id}
                        onClick={() => handleMarkRead(notification)}
                      >
                        {busyNotificationId === notification.id ? "Saving…" : "Mark Read"}
                      </button>
                    )}
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

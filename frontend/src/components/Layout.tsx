import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { api } from "../api/client";
import type { ApiMessage, ApiError, Notification } from "../api/types";

const NOTIFICATION_LABELS = {
  moderation_warning: "Warning",
  post_removed: "Post Removed",
} as const;

function formatNotificationDate(value: string) {
  return new Date(value).toLocaleString();
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOverflows, setNavOverflows] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const userActionsRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const navOverflowsRef = useRef(false);
  const switchBackThresholdRef = useRef(0);

  useEffect(() => {
    if (!dropdownOpen && !notificationsOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setDropdownOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen, notificationsOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !hamburgerRef.current?.contains(target) &&
        !navRef.current?.contains(target)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMenuOpen(false);
      setDropdownOpen(false);
      setNotificationsOpen(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleResendVerification() {
    setResending(true);
    const { status } = await api.post<ApiMessage | ApiError>(
      "/auth/resend-verification",
      {}
    );
    setResending(false);
    if (status === 200) setResent(true);
  }

  const showVerificationBanner =
    user && !user.email_verified && pathname !== "/verify-email";

  useEffect(() => {
    if (!user) {
      const frame = window.requestAnimationFrame(() => {
        setNotifications([]);
        setNotificationsError(null);
        setNotificationsLoading(false);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    let cancelled = false;
    const controller = new AbortController();
    const frame = window.requestAnimationFrame(() => {
      setNotificationsLoading(true);
      setNotificationsError(null);
    });

    api
      .get<Notification[] | ApiError>("/notifications", controller.signal)
      .then(({ status, data }) => {
        if (cancelled) return;
        if (status === 200 && Array.isArray(data)) {
          setNotifications(data);
          return;
        }
        if (status === 401) {
          setNotifications([]);
          return;
        }
        setNotificationsError((data as ApiError).error ?? "Failed to load notifications");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setNotificationsError("Failed to load notifications");
      })
      .finally(() => {
        if (!cancelled) setNotificationsLoading(false);
      });

    return () => {
      window.cancelAnimationFrame(frame);
      cancelled = true;
      controller.abort();
    };
  }, [user, pathname]);

  useEffect(() => {
    const header = headerRef.current;
    const nav = navRef.current;
    if (!header || !nav) return;

    function check() {
      const brand = header!.querySelector(".brand") as HTMLElement | null;
      const userActionsWidth = userActionsRef.current?.offsetWidth ?? 0;
      const brandWidth = brand?.offsetWidth ?? 0;
      const computedStyle = window.getComputedStyle(header!);
      const paddingX =
        parseFloat(computedStyle.paddingLeft) +
        parseFloat(computedStyle.paddingRight);
      const gap = parseFloat(computedStyle.columnGap || computedStyle.gap || "0");

      if (!navOverflowsRef.current) {
        const overflowing = nav!.scrollWidth > nav!.clientWidth + 1;
        if (overflowing) {
          // Clone nav to measure its natural (no-wrap) width for the switch-back threshold
          const clone = nav!.cloneNode(true) as HTMLElement;
          clone.style.cssText =
            "position:fixed;top:-9999px;left:-9999px;display:flex;flex-wrap:nowrap;visibility:hidden;pointer-events:none;gap:10px;";
          document.body.appendChild(clone);
          const navNaturalWidth = clone.scrollWidth;
          document.body.removeChild(clone);

          switchBackThresholdRef.current =
            paddingX + brandWidth + navNaturalWidth + userActionsWidth + gap * 2 + 8;

          navOverflowsRef.current = true;
          setNavOverflows(true);
        }
      } else {
        // In hamburger mode — switch back once the header is wide enough
        if (header!.clientWidth >= switchBackThresholdRef.current) {
          navOverflowsRef.current = false;
          setNavOverflows(false);
        }
      }
    }

    const observer = new ResizeObserver(check);
    observer.observe(header);
    check();
    return () => observer.disconnect();
  }, []);

  const isAccount = pathname === "/login" || pathname === "/signup";
  const isFeed = pathname === "/posts";
  const isMyPosts = pathname === "/my-posts";
  const isNotifications = pathname === "/notifications";
  const isAdminQueue = pathname === "/admin/moderator-requests";
  const isModeratorWorkspace = pathname === "/moderator";
  const isDevPortal = pathname === "/developer";
  const isSearch = pathname === "/search";
  const isPostStudio =
    pathname === "/posts/create" ||
    (pathname.startsWith("/posts/") && pathname !== "/posts");
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications],
  );
  const previewNotifications = useMemo(() => notifications.slice(0, 4), [notifications]);

  return (
    <div className="app-shell">
      <header
        ref={headerRef}
        className={`topbar${navOverflows ? "topbar--overflow" : ""}`}
      >
        <h1 className="brand">
          <Link className="brand-link" to="/posts">
            GoodGame
          </Link>
        </h1>
        <button
          ref={hamburgerRef}
          className="nav-hamburger"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
        <nav ref={navRef} className={`nav${menuOpen ? "nav--open" : ""}`}>
          <Link
            className={isFeed ? "active" : ""}
            to="/posts"
            onClick={() => setMenuOpen(false)}
          >
            Patch Feed
          </Link>
          <Link className={isSearch ? "active" : ""} to="/search" onClick={() => setMenuOpen(false)}>
            Search
          </Link>
          {user && (
            <Link
              className={isMyPosts ? "active" : ""}
              to="/my-posts"
              onClick={() => setMenuOpen(false)}
            >
              My Posts
            </Link>
          )}
          <Link
            className={isPostStudio ? "active" : ""}
            to="/posts/create"
            onClick={() => setMenuOpen(false)}
          >
            Post Studio
          </Link>
          {user?.role === "developer" && (
            <Link
              className={isDevPortal ? "active" : ""}
              to="/developer"
              onClick={() => setMenuOpen(false)}
            >
              Developer Portal
            </Link>
          )}
          {user?.role === "moderator" && (
            <Link
              className={isModeratorWorkspace ? "active" : ""}
              to="/moderator"
              onClick={() => setMenuOpen(false)}
            >
              Moderator Workspace
            </Link>
          )}
          {user?.role === "admin" && (
            <Link
              className={isAdminQueue ? "active" : ""}
              to="/admin/moderator-requests"
              onClick={() => setMenuOpen(false)}
            >
              Admin Queue
            </Link>
          )}
          {!user && (
            <Link
              className={isAccount ? "active" : ""}
              to="/login"
              onClick={() => setMenuOpen(false)}
            >
              Login
            </Link>
          )}
        </nav>
        {user ? (
          <div className="topbar-user-actions" ref={userActionsRef}>
            <div
              className={`notification-wrapper${notificationsOpen ? " notification-wrapper--open" : ""}`}
              ref={notificationsRef}
            >
              <button
                className={`notification-button${isNotifications ? " active" : ""}`}
                aria-label={
                  unreadCount > 0
                    ? `Notifications: ${unreadCount} unread`
                    : "Notifications"
                }
                aria-expanded={notificationsOpen}
                onClick={() => {
                  setNotificationsOpen((open) => !open);
                  setDropdownOpen(false);
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M14.857 17.082a23.848 23.848 0 0 1-5.714 0m5.714 0a5.454 5.454 0 0 0 1.102-.393A1.84 1.84 0 0 0 17 14.96V11.25a5 5 0 1 0-10 0v3.71c0 .755.427 1.416 1.042 1.73.35.179.719.31 1.102.392m5.713 0A3 3 0 0 1 9.143 17.082" />
                  <path d="M10 17.5a2 2 0 1 0 4 0" />
                </svg>
                {unreadCount > 0 && (
                  <span className="notification-badge" aria-hidden="true">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <div className="notification-panel">
                  <div className="notification-panel-header">
                    <div>
                      <p className="notification-panel-tag">Inbox</p>
                      <h3 className="notification-panel-title">Notifications</h3>
                    </div>
                    <span className="notification-panel-count">
                      {unreadCount} unread
                    </span>
                  </div>

                  {notificationsLoading ? (
                    <p className="notification-panel-state">Loading…</p>
                  ) : notificationsError ? (
                    <p className="notification-panel-state">{notificationsError}</p>
                  ) : previewNotifications.length === 0 ? (
                    <p className="notification-panel-state">
                      No notifications yet.
                    </p>
                  ) : (
                    <div className="notification-preview-list">
                      {previewNotifications.map((notification) => (
                        <Link
                          className={`notification-preview-item${notification.is_read ? "" : " unread"}`}
                          key={notification.id}
                          to="/notifications"
                          onClick={() => {
                            setNotificationsOpen(false);
                            setMenuOpen(false);
                          }}
                        >
                          <div className="notification-preview-meta">
                            <span>{NOTIFICATION_LABELS[notification.type]}</span>
                            <span>{formatNotificationDate(notification.created_at)}</span>
                          </div>
                          <strong className="notification-preview-title">
                            {notification.title}
                          </strong>
                          <p className="notification-preview-message">
                            {notification.message}
                          </p>
                        </Link>
                      ))}
                    </div>
                  )}

                  <div className="notification-panel-footer">
                    <Link
                      className="notification-panel-link"
                      to="/notifications"
                      onClick={() => {
                        setNotificationsOpen(false);
                        setMenuOpen(false);
                      }}
                    >
                      View all notifications
                    </Link>
                  </div>
                </div>
              )}
            </div>
            <div
              className={`nav-avatar-wrapper${dropdownOpen ? " nav-avatar-wrapper--open" : ""}`}
              ref={dropdownRef}
            >
              <button
                className="nav-avatar"
                aria-label={`Account: ${user.username}`}
                aria-expanded={dropdownOpen}
                onClick={() => {
                  setDropdownOpen((o) => !o);
                  setNotificationsOpen(false);
                }}
              >
                <svg
                  viewBox="0 0 448 512"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3C0 498.7 13.3 512 29.7 512l388.6 0c16.4 0 29.7-13.3 29.7-29.7C448 383.8 368.2 304 269.7 304l-91.4 0z" />
                </svg>
              </button>
              <div className="nav-avatar-tooltip" role="tooltip">
                <span className="nav-avatar-tooltip-name">{user.username}</span>
                <span className="nav-avatar-tooltip-role">{user.role}</span>
              </div>
              {dropdownOpen && (
                <div className="nav-dropdown">
                  <div className="nav-dropdown-user">
                    <span className="nav-dropdown-username">{user.username}</span>
                    <span className="nav-dropdown-role">{user.role}</span>
                  </div>
                  <button
                    className="nav-dropdown-item"
                    onClick={() => {
                      logout();
                      setDropdownOpen(false);
                    }}
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </header>
      {showVerificationBanner && (
        <div className="email-banner">
          <p className="email-banner-text">
            Your email is not verified.{" "}
            <Link className="email-banner-link" to="/verify-email">
              Check your inbox
            </Link>{" "}
            or{" "}
            {resent ? (
              <span className="email-banner-sent">email sent!</span>
            ) : (
              <button
                className="email-banner-link email-banner-btn"
                type="button"
                disabled={resending}
                onClick={handleResendVerification}
              >
                {resending ? "sending…" : "resend verification email"}
              </button>
            )}
          </p>
        </div>
      )}
      {children}
    </div>
  );
}

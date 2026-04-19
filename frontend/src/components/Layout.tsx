import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);
  const isAccount = pathname === "/login" || pathname === "/signup";
  const isFeed = pathname === "/posts";
  const isMyPosts = pathname === "/my-posts";
  const isAdminQueue = pathname === "/admin/moderator-requests";
  const isModeratorWorkspace = pathname === "/moderator";
  const isPostStudio =
    pathname === "/posts/create" || pathname.startsWith("/posts/") && pathname !== "/posts";

  if (isModeratorWorkspace && user?.role === "moderator") {
    return (
      <div className="app-shell">
        <header className="topbar">
          <div>
            <h1 className="brand">
              <Link className="brand-link" to="/moderator">
                GoodGame Moderation
              </Link>
            </h1>
            <p className="topbar-copy">
              Separate moderator workspace for review queues and moderation guidance.
            </p>
          </div>
          <nav className="nav" aria-label="Moderator workspace">
            <Link className="active" to="/moderator">
              Queue
            </Link>
            <Link to="/posts">Community Feed</Link>
            <button
              className="nav-button"
              type="button"
              onClick={() => {
                logout();
              }}
            >
              Sign Out
            </button>
          </nav>
        </header>
        {children}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1 className="brand">
          <Link className="brand-link" to="/posts">
            GoodGame
          </Link>
        </h1>
        <nav className="nav">
          <span>Game Hubs</span>
          <Link className={isFeed ? "active" : ""} to="/posts">
            Patch Feed
          </Link>
          {user && (
            <Link className={isMyPosts ? "active" : ""} to="/my-posts">
              My Posts
            </Link>
          )}
          <Link
            className={isPostStudio ? "active" : ""}
            to="/posts/create"
          >
            Post Studio
          </Link>
          {user ? (
            <div className="nav-avatar-wrapper" ref={dropdownRef}>
              <button
                className="nav-avatar"
                aria-label="Account"
                aria-expanded={dropdownOpen}
                onClick={() => setDropdownOpen((o) => !o)}
              >
                <svg viewBox="0 0 448 512" fill="currentColor" aria-hidden="true">
                  <path d="M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3C0 498.7 13.3 512 29.7 512l388.6 0c16.4 0 29.7-13.3 29.7-29.7C448 383.8 368.2 304 269.7 304l-91.4 0z" />
                </svg>
              </button>
              {dropdownOpen && (
                <div className="nav-dropdown">
                  {user.role === "moderator" && (
                    <Link
                      className={`nav-dropdown-item ${isModeratorWorkspace ? "active" : ""}`}
                      to="/moderator"
                      onClick={() => setDropdownOpen(false)}
                    >
                      Moderator Workspace
                    </Link>
                  )}
                  {user.role === "admin" && (
                    <Link
                      className={`nav-dropdown-item ${isAdminQueue ? "active" : ""}`}
                      to="/admin/moderator-requests"
                      onClick={() => setDropdownOpen(false)}
                    >
                      Admin Queue
                    </Link>
                  )}
                  <button
                    className="nav-dropdown-item"
                    onClick={() => { logout(); setDropdownOpen(false); }}
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link className={isAccount ? "active" : ""} to="/login">
              Login
            </Link>
          )}
        </nav>
      </header>
      {children}
    </div>
  );
}

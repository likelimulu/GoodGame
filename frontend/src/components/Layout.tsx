import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { api } from "../api/client";
import type { ApiMessage, ApiError } from "../api/types";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOverflows, setNavOverflows] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const navOverflowsRef = useRef(false);
  const switchBackThresholdRef = useRef(0);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

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
    const frame = window.requestAnimationFrame(() => setMenuOpen(false));
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
    const header = headerRef.current;
    const nav = navRef.current;
    if (!header || !nav) return;

    function check() {
      if (!navOverflowsRef.current) {
        // Nav is visible — detect if any item has wrapped to a second row
        const children = Array.from(nav!.children) as HTMLElement[];
        if (children.length <= 1) return;
        const firstTop = children[0].getBoundingClientRect().top;
        const wrapped = children.some(
          (child, i) =>
            i > 0 && Math.abs(child.getBoundingClientRect().top - firstTop) > 4
        );
        if (wrapped) {
          // Clone nav to measure its natural (no-wrap) width for the switch-back threshold
          const clone = nav!.cloneNode(true) as HTMLElement;
          clone.style.cssText =
            "position:fixed;top:-9999px;left:-9999px;display:flex;flex-wrap:nowrap;visibility:hidden;pointer-events:none;gap:10px;";
          document.body.appendChild(clone);
          const navNaturalWidth = clone.scrollWidth;
          document.body.removeChild(clone);

          const brand = header!.querySelector(".brand") as HTMLElement;
          const brandWidth = brand?.offsetWidth ?? 0;
          switchBackThresholdRef.current =
            brandWidth + 16 + navNaturalWidth + 40;

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
  const isAdminQueue = pathname === "/admin/moderator-requests";
  const isModeratorWorkspace = pathname === "/moderator";
  const isDevPortal = pathname === "/developer";
  const isSearch = pathname === "/search";
  const isPostStudio =
    pathname === "/posts/create" ||
    (pathname.startsWith("/posts/") && pathname !== "/posts");

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
          <span>Game Hubs</span>
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
          {user ? (
            <div
              className={`nav-avatar-wrapper${dropdownOpen ? " nav-avatar-wrapper--open" : ""}`}
              ref={dropdownRef}
            >
              <button
                className="nav-avatar"
                aria-label={`Account: ${user.username}`}
                aria-expanded={dropdownOpen}
                onClick={() => setDropdownOpen((o) => !o)}
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
          ) : (
            <Link
              className={isAccount ? "active" : ""}
              to="/login"
              onClick={() => setMenuOpen(false)}
            >
              Login
            </Link>
          )}
        </nav>
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

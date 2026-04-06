import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const isAccount = pathname === "/login" || pathname === "/signup";
  const isFeed = pathname === "/posts";
  const isMyPosts = pathname === "/my-posts";
  const isPostStudio =
    pathname === "/posts/create" || pathname.startsWith("/posts/") && pathname !== "/posts";

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
          <Link className={isAccount ? "active" : ""} to="/login">
            Account
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}

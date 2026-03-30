import { Link, useLocation } from "react-router-dom";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const isAccount = pathname === "/login" || pathname === "/signup";
  const isPostStudio =
    pathname === "/posts/create" || pathname.startsWith("/posts/");

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1 className="brand">
          <Link className="brand-link" to="/login">
            GoodGame
          </Link>
        </h1>
        <nav className="nav">
          <span>Game Hubs</span>
          <span>Patch Feed</span>
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

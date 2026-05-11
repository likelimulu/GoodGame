import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { useAuth } from "../context/useAuth";
import { useToast } from "../context/ToastContext";

function getLandingPath(role: string) {
  if (role === "admin") return "/admin/moderator-requests";
  if (role === "moderator") return "/moderator";
  return "/posts";
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: { preventDefault(): void; currentTarget: HTMLFormElement }) {
    e.preventDefault();
    const form = e.currentTarget;
    const username = (form.elements.namedItem("username") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    setError(null);
    setSubmitting(true);
    const result = await login(username, password, rememberMe);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      addToast(result.error, "error");
    } else {
      addToast("Welcome back!", "success");
      navigate(getLandingPath(result.user?.role ?? "contributor"));
    }
  }

  return (
    <Layout>
      <main className="page-grid">
        <section className="hero-card">
          <span className="eyebrow">Arcade Garage</span>
          <h1 className="headline">Welcome Back</h1>
          <p className="subhead">Sign in to continue to GoodGame.</p>
        </section>

        <section className="form-card">
          <p className="panel-tag">Account Access</p>
          <h2 className="section-title">Log In</h2>
          <p className="helper">Use your username and password.</p>

          <form className="form-fields" onSubmit={handleSubmit}>
            {error && <p className="form-error">{error}</p>}

            <div className="field">
              <label htmlFor="login-username">Username</label>
              <input
                id="login-username"
                name="username"
                type="text"
                placeholder="player123"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="login-password">Password</label>
              <div className="password-wrapper">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            <div className="check-row">
              <label className="check">
                <input
                  name="remember_me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Keep me signed in on this device</span>
              </label>
              <button
                className="action-link text-link"
                type="button"
                onClick={() =>
                  addToast("Password reset is not enabled yet.", "info")
                }
              >
                Forgot password?
              </button>
            </div>

            <div className="action-row">
              <button className="btn primary" type="submit" disabled={submitting}>
                {submitting ? "Logging in…" : "Log In"}
              </button>
            </div>
          </form>

          <p className="inline-copy">
            New here?{" "}
            <Link className="text-link" to="/signup">
              Create an account
            </Link>
            .
          </p>
        </section>
      </main>
    </Layout>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { useAuth } from "../context/useAuth";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [rememberMe, setRememberMe] = useState(false);
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
    } else {
      navigate("/posts/create");
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
              <input
                id="login-password"
                name="password"
                type="password"
                placeholder="Enter your password"
                required
              />
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
              <a className="text-link" href="#">
                Forgot password?
              </a>
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

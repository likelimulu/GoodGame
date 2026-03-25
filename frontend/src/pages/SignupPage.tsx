import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { useAuth } from "../context/useAuth";

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: { preventDefault(): void; currentTarget: HTMLFormElement }) {
    e.preventDefault();
    const form = e.currentTarget;
    const username = (form.elements.namedItem("username") as HTMLInputElement).value;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    const confirmPassword = (form.elements.namedItem("confirm_password") as HTMLInputElement).value;

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setError(null);
    setSubmitting(true);
    const result = await signup(username, email, password);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
    } else {
      navigate("/login");
    }
  }

  return (
    <Layout>
      <main className="page-grid">
        <section className="hero-card">
          <span className="eyebrow">Arcade Garage</span>
          <h1 className="headline">Create Account</h1>
          <p className="subhead">
            Set up your username, email, and password to get started.
          </p>
        </section>

        <section className="form-card">
          <p className="panel-tag">Account Access</p>
          <h2 className="section-title">Sign Up</h2>
          <p className="helper">Create your username, email, and password.</p>

          <form className="form-fields" onSubmit={handleSubmit}>
            {error && <p className="form-error">{error}</p>}

            <div className="field">
              <label htmlFor="signup-username">Username</label>
              <input
                id="signup-username"
                name="username"
                type="text"
                placeholder="Choose your player name"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
                name="email"
                type="email"
                placeholder="you@goodgame.gg"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="signup-password">Password</label>
              <input
                id="signup-password"
                name="password"
                type="password"
                placeholder="Create strong password"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="signup-password-confirm">Confirm Password</label>
              <input
                id="signup-password-confirm"
                name="confirm_password"
                type="password"
                placeholder="Re-enter password"
                required
              />
            </div>

            <p className="form-note">
              Use a strong password and avoid common or compromised passwords.
            </p>

            <label className="check">
              <input name="accept_policy" type="checkbox" required />
              <span>
                I agree to the account policy and community moderation rules.
              </span>
            </label>

            <div className="action-row">
              <button className="btn primary" type="submit" disabled={submitting}>
                {submitting ? "Creating account…" : "Create Account"}
              </button>
            </div>
          </form>

          <p className="inline-copy">
            Already have an account?{" "}
            <Link className="text-link" to="/login">
              Log in
            </Link>
            .
          </p>
        </section>
      </main>
    </Layout>
  );
}

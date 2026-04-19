import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { ApiError, ModeratorAccessRequest } from "../api/types";
import Layout from "../components/Layout";
import { useAuth } from "../context/useAuth";
import { useToast } from "../context/ToastContext";

export default function SignupPage() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requestModerator, setRequestModerator] = useState(false);

  async function handleSubmit(e: { preventDefault(): void; currentTarget: HTMLFormElement }) {
    e.preventDefault();
    const form = e.currentTarget;
    const username = (form.elements.namedItem("username") as HTMLInputElement).value;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    const confirmPassword = (form.elements.namedItem("confirm_password") as HTMLInputElement).value;
    const moderatorReason = (
      form.elements.namedItem("moderator_reason") as HTMLTextAreaElement | null
    )?.value.trim() ?? "";

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
      addToast(result.error, "error");
    } else {
      if (!requestModerator) {
        addToast("Account created! Please log in.", "success");
        navigate("/login");
        return;
      }

      const loginResult = await login(username, password, false);
      if (loginResult.error) {
        const message =
          "Account created, but moderator request could not be submitted automatically. Please log in and contact an admin.";
        setError(message);
        addToast(message, "error");
        navigate("/login");
        return;
      }

      const moderatorResult = await api.post<ModeratorAccessRequest | ApiError>(
        "/users/me/moderator-request",
        { reason: moderatorReason }
      );

      if (moderatorResult.status === 201) {
        addToast(
          "Account created. Moderator access request submitted for admin review.",
          "success"
        );
        navigate("/posts");
        return;
      }

      const message =
        (moderatorResult.data as ApiError).error ??
        "Account created, but moderator request submission failed.";
      setError(message);
      addToast(message, "error");
      navigate("/posts");
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
          <p className="helper">
            Create your username, email, and password. Request moderator access if you
            need review tools.
          </p>

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

            <label className="check">
              <input
                checked={requestModerator}
                name="request_moderator"
                type="checkbox"
                onChange={(event) => setRequestModerator(event.target.checked)}
              />
              <span>Request moderator access for this account.</span>
            </label>

            {requestModerator ? (
              <>
                <p className="form-note">
                  Moderator access is not granted immediately. An admin must review and
                  approve your request first.
                </p>
                <div className="field">
                  <label htmlFor="signup-moderator-reason">Why are you requesting access?</label>
                  <textarea
                    id="signup-moderator-reason"
                    name="moderator_reason"
                    placeholder="Optional note for the admin review team"
                    rows={4}
                  />
                </div>
              </>
            ) : null}

            <div className="action-row">
              <button className="btn primary" type="submit" disabled={submitting}>
                {submitting
                  ? "Creating account…"
                  : requestModerator
                    ? "Create Account and Request Access"
                    : "Create Account"}
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

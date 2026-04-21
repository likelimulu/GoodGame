import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import Spinner from "../components/Spinner";
import { api } from "../api/client";
import type { ApiError, ApiMessage } from "../api/types";
import { useAuth } from "../context/useAuth";
import { useToast } from "../context/ToastContext";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { user } = useAuth();
  const { addToast } = useToast();

  const [status, setStatus] = useState<"loading" | "success" | "error" | "no-token">(
    token ? "loading" : "no-token",
  );
  const [message, setMessage] = useState("");
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token) return;

    api
      .post<ApiMessage | ApiError>("/auth/verify-email", { token })
      .then(({ status: httpStatus, data }) => {
        if (httpStatus === 200) {
          setStatus("success");
          setMessage((data as ApiMessage).message);
        } else {
          setStatus("error");
          setMessage((data as ApiError).error ?? "Verification failed");
        }
      });
  }, [token]);

  async function handleResend() {
    setResending(true);
    const { status: httpStatus, data } = await api.post<ApiMessage | ApiError>(
      "/auth/resend-verification",
      {},
    );
    setResending(false);

    if (httpStatus === 200) {
      addToast("Verification email sent! Check your inbox.", "success");
    } else {
      addToast((data as ApiError).error ?? "Failed to resend", "error");
    }
  }

  return (
    <Layout>
      <main className="page-grid">
        <section className="hero-card">
          <span className="eyebrow">Account Security</span>
          <h1 className="headline">Verify Email</h1>
          <p className="subhead">
            Email verification keeps your account secure and lets the community
            trust your identity.
          </p>
        </section>

        <section className="form-card">
          <p className="panel-tag">Email Verification</p>

          {status === "loading" && (
            <>
              <h2 className="section-title">Verifying…</h2>
              <Spinner text="Checking your verification token…" />
            </>
          )}

          {status === "success" && (
            <>
              <h2 className="section-title">Verified!</h2>
              <p className="helper">{message}</p>
              <p className="helper">
                Your email has been confirmed. You now have full access to all
                GoodGame features.
              </p>
              <div className="action-row" style={{ marginTop: "14px" }}>
                <Link className="btn primary" to="/posts">
                  Go to Community Feed
                </Link>
              </div>
            </>
          )}

          {status === "error" && (
            <>
              <h2 className="section-title">Verification Failed</h2>
              <p className="helper">{message}</p>
              {user && !user.email_verified && (
                <div className="action-row" style={{ marginTop: "14px" }}>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={resending}
                    onClick={handleResend}
                  >
                    {resending ? "Sending…" : "Resend Verification Email"}
                  </button>
                </div>
              )}
              <div className="action-row" style={{ marginTop: "8px" }}>
                <Link className="btn ghost" to="/posts">
                  Back to Feed
                </Link>
              </div>
            </>
          )}

          {status === "no-token" && (
            <>
              <h2 className="section-title">Check Your Inbox</h2>
              <p className="helper">
                We sent a verification link to your email address. Click the
                link in the email to verify your account.
              </p>
              {user && !user.email_verified && (
                <div className="action-row" style={{ marginTop: "14px" }}>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={resending}
                    onClick={handleResend}
                  >
                    {resending ? "Sending…" : "Resend Verification Email"}
                  </button>
                </div>
              )}
              <div className="action-row" style={{ marginTop: "8px" }}>
                <Link className="btn ghost" to="/posts">
                  Back to Feed
                </Link>
              </div>
            </>
          )}
        </section>
      </main>
    </Layout>
  );
}

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { useAuth } from "./context/useAuth";
import ErrorBoundary from "./components/ErrorBoundary";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import CreatePostPage from "./pages/CreatePostPage";
import EditPostPage from "./pages/EditPostPage";
import PostsFeedPage from "./pages/PostsFeedPage";
import AdminModeratorRequestsPage from "./pages/AdminModeratorRequestsPage";
import ModeratorWorkspacePage from "./pages/ModeratorWorkspacePage";
import NotificationsPage from "./pages/NotificationsPage";
import ContentRulesPage from "./pages/ContentRulesPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import DeveloperPage from "./pages/DeveloperPage";
import SearchPage from "./pages/SearchPage";
import NotFoundPage from "./pages/error/NotFoundPage";
import ErrorPage from "./pages/error/ErrorPage";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/posts" replace />;
  return <>{children}</>;
}

function RequireModerator({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "moderator") return <Navigate to="/posts" replace />;
  return <>{children}</>;
}

function RequireDeveloper({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "developer") return <Navigate to="/posts" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/posts" replace />} />
              <Route path="/posts" element={<PostsFeedPage />} />
              <Route
                path="/my-posts"
                element={
                  <RequireAuth>
                    <PostsFeedPage mineOnly />
                  </RequireAuth>
                }
              />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/content-rules" element={<ContentRulesPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route
                path="/notifications"
                element={
                  <RequireAuth>
                    <NotificationsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/posts/create"
                element={
                  <RequireAuth>
                    <CreatePostPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/posts/:postId/edit"
                element={
                  <RequireAuth>
                    <EditPostPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/admin/moderator-requests"
                element={
                  <RequireAdmin>
                    <AdminModeratorRequestsPage />
                  </RequireAdmin>
                }
              />
              <Route
                path="/moderator"
                element={
                  <RequireModerator>
                    <ModeratorWorkspacePage />
                  </RequireModerator>
                }
              />
              <Route
                path="/developer"
                element={
                  <RequireDeveloper>
                    <DeveloperPage />
                  </RequireDeveloper>
                }
              />
              <Route path="/error/:status" element={<ErrorPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;

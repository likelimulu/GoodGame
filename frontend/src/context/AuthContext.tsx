import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { api } from "../api/client";
import type { AuthUser, ApiError } from "../api/types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (
    username: string,
    password: string,
    rememberMe: boolean
  ) => Promise<{ error?: string; user?: AuthUser }>;
  signup: (
    username: string,
    email: string,
    password: string
  ) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    api
      .get<AuthUser | ApiError>("/auth/me", controller.signal)
      .then(({ status, data }) => {
        if (!cancelled && status === 200) setUser(data as AuthUser);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const login = useCallback(
    async (username: string, password: string, rememberMe: boolean) => {
      const { status, data } = await api.post<AuthUser | ApiError>(
        "/auth/login",
        {
          username,
          password,
          remember_me: rememberMe,
        }
      );
      if (status === 200) {
        const authUser = data as AuthUser;
        setUser(authUser);
        return { user: authUser };
      }
      return { error: (data as ApiError).error };
    },
    []
  );

  const signup = useCallback(
    async (username: string, email: string, password: string) => {
      const { status, data } = await api.post<
        { id: number; username: string } | ApiError
      >("/signup", { username, email, password });
      if (status === 201) return {};
      return { error: (data as ApiError).error ?? "Signup failed" };
    },
    []
  );

  const logout = useCallback(async () => {
    await api.post<unknown>("/auth/logout", {});
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, signup, logout }),
    [user, loading, login, signup, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

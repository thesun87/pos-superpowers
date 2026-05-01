"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from "react";

interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: "OWNER" | "CASHIER";
  tenantId: string;
}

interface AuthContextValue {
  accessToken: string | null;
  user: AuthUser | null;
  setSession: (s: { accessToken: string; user: AuthUser }) => void;
  clear: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const setSession = useCallback((s: { accessToken: string; user: AuthUser }) => {
    setAccessToken(s.accessToken);
    setUser(s.user);
  }, []);

  const clear = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ accessToken, user, setSession, clear }),
    [accessToken, user, setSession, clear]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

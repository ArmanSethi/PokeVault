import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { api } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { supabase } from "../lib/supabase";

interface AuthState {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ needsConfirmation: boolean; alreadyExists?: boolean }>;
  signOut: () => Promise<void>;
  /** Send a password-reset email; the link lands on /reset-password with a recovery session. */
  resetPassword: (email: string) => Promise<void>;
  /** Set a new password for the current (recovery) session. */
  updatePassword: (password: string) => Promise<void>;
  /** Send a passwordless magic-link email; the link lands on / and signs the user in. */
  signInWithMagicLink: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      loading,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(errorMessage(error, "Invalid email or password."));
      },
      signUp: async (email, password) => {
        // Supabase's built-in confirmation mailer is broken on this project, so create the
        // confirmed auth user through our own API and then log in normally for a real session.
        const { created } = await api.signup(email, password);
        if (!created) return { needsConfirmation: false, alreadyExists: true };
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(errorMessage(error, "Could not sign in after signup."));
        return { needsConfirmation: false };
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      resetPassword: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw new Error(errorMessage(error));
      },
      updatePassword: async (password) => {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw new Error(errorMessage(error));
      },
      signInWithMagicLink: async (email) => {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw new Error(errorMessage(error));
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

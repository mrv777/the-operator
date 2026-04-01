"use client";

import { useEffect, useState } from "react";
import { getToken, setToken } from "@/lib/auth-client";

export function AuthShell({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null); // null = loading

  useEffect(() => {
    setTokenState(getToken());
  }, []);

  function handleLogin(value: string) {
    setToken(value);
    setTokenState(value);
  }

  // Loading — avoid flash of login form during hydration
  if (token === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-signal border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!token) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return <>{children}</>;
}

function LoginForm({ onLogin }: { onLogin: (token: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(false);

    // Validate the token against the API
    const res = await fetch("/api/agent/status", {
      headers: { Authorization: `Bearer ${value}` },
    });

    if (res.ok) {
      onLogin(value);
    } else {
      setError(true);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <form onSubmit={handleSubmit} className="w-80 space-y-4">
        <div className="flex items-center gap-2 justify-center mb-6">
          <div className="w-10 h-10 rounded-lg bg-signal flex items-center justify-center text-lg font-bold">
            O
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">The Operator</h1>
            <p className="text-xs text-text-muted">SM Convergence Agent</p>
          </div>
        </div>
        <input
          type="password"
          placeholder="Dashboard token"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          className="w-full bg-bg-card border border-border rounded-lg px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-signal/50"
        />
        {error && (
          <p className="text-loss text-xs text-center">Invalid token</p>
        )}
        <button
          type="submit"
          className="w-full py-3 rounded-lg text-sm font-medium bg-signal/20 text-signal hover:bg-signal/30 transition-colors"
        >
          Enter
        </button>
      </form>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseBrowser";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setBusy(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setBusy(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    router.push("/dashboard");
  }

  async function handleForgotPassword() {
    setErrorMsg(null);
    setInfoMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg("Enter your email first, then click “Forgot password?”.");
      return;
    }

    setBusy(true);

    // Send a recovery link that returns to your callback page.
    // Your /auth/callback should redirect recovery → /reset
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback`
        : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo,
    });

    setBusy(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setInfoMsg(
      "Password reset email sent ✅ Check your inbox. Open the link to set a new password."
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: "80px auto", padding: 20 }}>
      <h1 style={{ fontSize: 28, marginBottom: 20, textAlign: "center" }}>
        Login
      </h1>

      <form onSubmit={handleLogin}>
        <div style={{ marginBottom: 15 }}>
          <label style={{ display: "block", fontWeight: 600 }}>Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            style={{
              width: "100%",
              padding: 10,
              marginTop: 6,
              borderRadius: 8,
              border: "1px solid #ccc",
            }}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "block", fontWeight: 600 }}>Password</label>

          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid #ccc",
              }}
            />

            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 8,
            }}
          >
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={busy}
              style={{
                background: "transparent",
                border: "none",
                color: "#111",
                textDecoration: "underline",
                cursor: busy ? "not-allowed" : "pointer",
                padding: 0,
                fontSize: 13,
              }}
            >
              Forgot password?
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            padding: 12,
            backgroundColor: "#000",
            color: "#fff",
            borderRadius: 8,
            border: "none",
            cursor: busy ? "not-allowed" : "pointer",
            fontWeight: 700,
          }}
        >
          {busy ? "Signing in..." : "Sign In"}
        </button>
      </form>

      {errorMsg && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            backgroundColor: "#f8d7da",
            color: "#842029",
            borderRadius: 10,
          }}
        >
          {errorMsg}
        </div>
      )}

      {infoMsg && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            backgroundColor: "#e7f5ff",
            color: "#084298",
            borderRadius: 10,
          }}
        >
          {infoMsg}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseBrowser";

export default function ResetPassword() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function updatePassword() {
    setMsg("");
    setBusy(true);

    const { error } = await supabase.auth.updateUser({ password });

    setBusy(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg("Password updated ✅");
    router.push("/dashboard");
  }

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h1>Set Password</h1>
      <p style={{ opacity: 0.75 }}>
        Use this page after opening an invite or recovery link. If you didn’t come from a Supabase link,
        you may need to request a password reset first.
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, opacity: 0.8 }}>New password</span>
          <input
            type="password"
            placeholder="Enter a strong password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: 12, borderRadius: 10, border: "1px solid #ccc" }}
            autoComplete="new-password"
          />
        </label>

        <button
          onClick={updatePassword}
          disabled={!password || busy}
          style={{
            borderRadius: 10,
            border: "none",
            padding: 12,
            fontWeight: 600,
            background: !password || busy ? "#bbb" : "#111",
            color: "white"
          }}
        >
          {busy ? "Saving..." : "Save Password"}
        </button>

        {msg && (
          <div style={{ padding: 12, borderRadius: 10, background: "#f5f5f5" }}>
            {msg}
          </div>
        )}
      </div>
    </main>
  );
}

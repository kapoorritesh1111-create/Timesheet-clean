// src/app/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseBrowser";
import { useProfile } from "../lib/useProfile";

export default function HomePage() {
  const router = useRouter();
  const { loading, profile, userId } = useProfile();

  useEffect(() => {
    // If the hook says we are done and there is no user, go login.
    if (!loading && (!userId || !profile)) {
      router.replace("/login");
    }
    // If we have a user, go dashboard.
    if (!loading && userId && profile) {
      router.replace("/dashboard");
    }
  }, [loading, userId, profile, router]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>Timesheet</h1>
      <p style={{ marginTop: 10, opacity: 0.8 }}>
        Loading…
      </p>

      {/* In case redirect is blocked for any reason */}
      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => router.push("/login")}>Login</button>
        <button onClick={() => router.push("/dashboard")}>Dashboard</button>
        <button onClick={logout}>Logout</button>
      </div>
    </main>
  );
}

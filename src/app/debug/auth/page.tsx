"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseBrowser";

export default function DebugAuthPage() {
  const [sessionJson, setSessionJson] = useState<string>("(loading)");
  const [userJson, setUserJson] = useState<string>("(loading)");
  const [envJson, setEnvJson] = useState<string>("(loading)");
  const [lastEvent, setLastEvent] = useState<string>("(none)");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    try {
      const env = {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? "SET" : "MISSING",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "SET" : "MISSING",
        origin: typeof window !== "undefined" ? window.location.origin : "(server)",
        href: typeof window !== "undefined" ? window.location.href : "(server)",
      };
      setEnvJson(JSON.stringify(env, null, 2));
    } catch (e: any) {
      setEnvJson("(failed to read env)");
      setError(e?.message || "Unknown env error");
    }

    async function load() {
      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) setError(sessErr.message);
      setSessionJson(JSON.stringify(sess?.session ?? null, null, 2));

      const { data: usr, error: usrErr } = await supabase.auth.getUser();
      if (usrErr) setError(usrErr.message);
      setUserJson(JSON.stringify(usr?.user ?? null, null, 2));
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setLastEvent(event);
      setSessionJson(JSON.stringify(session ?? null, null, 2));
    });

    return () => {
      sub?.subscription?.unsubscribe();
    };
  }, []);

  async function refresh() {
    const { data: sess, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) setError(sessErr.message);
    setSessionJson(JSON.stringify(sess?.session ?? null, null, 2));

    const { data: usr, error: usrErr } = await supabase.auth.getUser();
    if (usrErr) setError(usrErr.message);
    setUserJson(JSON.stringify(usr?.user ?? null, null, 2));
  }

  async function signOut() {
    await supabase.auth.signOut();
    await refresh();
  }

  return (
    <main style={{ maxWidth: 1000, margin: "24px auto", padding: 16 }}>
      <h1 style={{ margin: 0 }}>Auth Debug</h1>
      <p style={{ opacity: 0.8, marginTop: 8 }}>
        This page shows whether Supabase session is present in the browser.
      </p>

      {error ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid #f3c4c4",
            background: "#fff6f6",
            borderRadius: 12,
          }}
        >
          <b>Error:</b> {error}
        </div>
      ) : null}

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={refresh}>Refresh</button>
        <button onClick={signOut}>Logout</button>
      </div>

      <div style={{ marginTop: 18 }}>
        <h3>Last Auth Event</h3>
        <pre style={{ background: "#f6f6f6", padding: 12, borderRadius: 8 }}>{lastEvent}</pre>
      </div>

      <div style={{ marginTop: 18 }}>
        <h3>Env / Location</h3>
        <pre style={{ background: "#f6f6f6", padding: 12, borderRadius: 8 }}>{envJson}</pre>
      </div>

      <div style={{ marginTop: 18 }}>
        <h3>Session</h3>
        <pre style={{ background: "#f6f6f6", padding: 12, borderRadius: 8 }}>{sessionJson}</pre>
      </div>

      <div style={{ marginTop: 18 }}>
        <h3>User</h3>
        <pre style={{ background: "#f6f6f6", padding: 12, borderRadius: 8 }}>{userJson}</pre>
      </div>
    </main>
  );
}

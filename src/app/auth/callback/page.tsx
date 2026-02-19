"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseBrowser";

function getHashParams() {
  const hash = window.location.hash?.replace(/^#/, "") ?? "";
  const params = new URLSearchParams(hash);
  return {
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
    type: params.get("type"), // invite | recovery | magiclink etc
  };
}

export default function AuthCallback() {
  const router = useRouter();
  const [msg, setMsg] = useState("Signing you in…");

  useEffect(() => {
    (async () => {
      try {
        // 0) Surface Supabase error params if present
        const currentUrl = new URL(window.location.href);
        const errDesc =
          currentUrl.searchParams.get("error_description") ||
          currentUrl.searchParams.get("error");
        if (errDesc) {
          setMsg(decodeURIComponent(errDesc));
          return;
        }

        // 1) Handle invite/recovery/magic links that arrive via URL hash tokens
        const { access_token, refresh_token, type: hashType } = getHashParams();

        if (access_token && refresh_token) {
          // If user is already logged in as someone else, clear it.
          await supabase.auth.signOut();

          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });

          if (error) {
            setMsg(error.message);
            return;
          }

          if (hashType === "invite" || hashType === "recovery") {
            router.replace("/reset");
            return;
          }

          router.replace("/dashboard");
          return;
        }

        // 2) Handle token_hash style links (common for invites/recovery on mobile clients)
        const token_hash = currentUrl.searchParams.get("token_hash");
        const type = currentUrl.searchParams.get("type"); // invite | recovery | magiclink | signup

        if (token_hash && type) {
          // Clear any existing session (prevents "wrong user" issues)
          await supabase.auth.signOut();

          // Verify the OTP token_hash
          const { data, error } = await supabase.auth.verifyOtp({
            type: type as any,
            token_hash,
          });

          if (error) {
            setMsg(error.message);
            return;
          }

          // If invite/recovery: go set password
          if (type === "invite" || type === "recovery") {
            router.replace("/reset");
            return;
          }

          // For magiclink, etc.
          router.replace("/dashboard");
          return;
        }

        // 3) Handle OAuth code flow (?code=...)
        const code = currentUrl.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setMsg(error.message);
            return;
          }
          router.replace("/dashboard");
          return;
        }

        setMsg("Auth session missing: no tokens found in URL.");
      } catch (e: any) {
        setMsg(e?.message ?? "Unknown error");
      }
    })();
  }, [router]);

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <h1>Signing you in…</h1>
      <p style={{ opacity: 0.8 }}>{msg}</p>
    </main>
  );
}

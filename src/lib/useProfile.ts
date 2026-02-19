// src/lib/useProfile.ts
"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseBrowser";

export type Role = "admin" | "manager" | "contractor";

export type Profile = {
  id: string;
  org_id: string;
  role: Role;
  full_name: string | null;
  hourly_rate: number | null;
  is_active: boolean | null;
  manager_id: string | null;
};

async function fetchMyProfile(uid: string) {
  return await supabase
    .from("profiles")
    .select("id, org_id, role, full_name, hourly_rate, is_active, manager_id")
    .eq("id", uid)
    .maybeSingle();
}

export function useProfile() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      setLoading(true);
      setError("");

      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessErr) {
        setUserId(null);
        setProfile(null);
        setError(`Auth session error: ${sessErr.message}`);
        setLoading(false);
        return;
      }

      const uid = sessionData.session?.user?.id ?? null;
      setUserId(uid);

      if (!uid) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const { data: prof, error: profErr } = await fetchMyProfile(uid);
      if (cancelled) return;

      if (profErr) {
        setProfile(null);
        setError(`Profile query error: ${profErr.message}`);
        setLoading(false);
        return;
      }

      if (!prof) {
        setProfile(null);
        setError(
          "Profile missing: no row found in `profiles` for this user. An admin must create it (or enable auto-create trigger)."
        );
        setLoading(false);
        return;
      }

      setProfile(prof as any);
      setLoading(false);
    }

    // Initial load
    hydrate();

    // Re-hydrate on any auth change (login/logout, invite, recovery)
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      hydrate();
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  return { loading, userId, profile, error };
}

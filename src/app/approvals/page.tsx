// src/app/approvals/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseBrowser";
import { useProfile } from "../../lib/useProfile";
import { addDays, startOfWeekSunday, toISODate, weekRangeLabel } from "../../lib/date";

type EntryStatus = "draft" | "submitted" | "approved" | "rejected";

type EntryRow = {
  id: string;
  user_id: string;
  entry_date: string;
  project_id: string;
  notes: string | null;
  status: EntryStatus;
  hours_worked: number | null;
};

type ProfileRow = { id: string; full_name: string | null; role: string | null; manager_id?: string | null };
type ProjectRow = { id: string; name: string };

type GroupKey = string;
type Group = {
  key: GroupKey;
  user_id: string;
  week_start: string;
  week_end: string;
  entries: EntryRow[];
};

export default function ApprovalsPage() {
  const router = useRouter();
  const { loading: profLoading, profile, userId } = useProfile();

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekSunday(new Date()));
  const weekStartISO = useMemo(() => toISODate(weekStart), [weekStart]);
  const weekEndISO = useMemo(() => toISODate(addDays(weekStart, 6)), [weekStart]);

  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [projects, setProjects] = useState<Record<string, ProjectRow>>({});
  const [msg, setMsg] = useState("");
  const [busyKey, setBusyKey] = useState<string>("");

  const isManagerOrAdmin = profile?.role === "admin" || profile?.role === "manager";
  const isAdmin = profile?.role === "admin";
  const isManager = profile?.role === "manager";

  useEffect(() => {
    if (!profile || !userId) return;
    if (!isManagerOrAdmin) return;

    let cancelled = false;
    (async () => {
      setMsg("");

      // Manager scope: only direct reports
      let allowedUserIds: string[] | null = null;
      if (isManager) {
        const { data: team, error: teamErr } = await supabase
          .from("profiles")
          .select("id")
          .eq("org_id", profile.org_id)
          .eq("manager_id", userId)
          .eq("is_active", true);

        if (teamErr) {
          setMsg(teamErr.message);
          setEntries([]);
          return;
        }

        allowedUserIds = Array.from(new Set(((team as any) ?? []).map((x: any) => x.id)));
        if (allowedUserIds.length === 0) {
          setEntries([]);
          return;
        }
      }

      // load submitted entries for week
      let q = supabase
        .from("v_time_entries")
        .select("id, user_id, entry_date, project_id, notes, status, hours_worked")
        .gte("entry_date", weekStartISO)
        .lte("entry_date", weekEndISO)
        .eq("status", "submitted")
        .order("user_id", { ascending: true })
        .order("entry_date", { ascending: true });

      if (allowedUserIds) q = q.in("user_id", allowedUserIds);

      const { data: rows, error } = await q;

      if (cancelled) return;
      if (error) {
        setMsg(error.message);
        setEntries([]);
        return;
      }

      const list = ((rows as any) ?? []) as EntryRow[];
      setEntries(list);

      // load profile names
      const userIds = Array.from(new Set(list.map((r) => r.user_id)));
      if (userIds.length) {
        const { data: profs, error: perr } = await supabase
          .from("profiles")
          .select("id, full_name, role, manager_id")
          .in("id", userIds);

        if (!cancelled && !perr) {
          const map: Record<string, ProfileRow> = {};
          for (const p of (profs as any) ?? []) map[p.id] = p;
          setProfiles(map);
        }
      }

      // load projects referenced
      const projIds = Array.from(new Set(list.map((r) => r.project_id)));
      if (projIds.length) {
        const { data: projs, error: perr2 } = await supabase
          .from("projects")
          .select("id, name")
          .in("id", projIds);

        if (!cancelled && !perr2) {
          const map: Record<string, ProjectRow> = {};
          for (const p of (projs as any) ?? []) map[p.id] = p;
          setProjects(map);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile, userId, isManagerOrAdmin, isManager, weekStartISO, weekEndISO]);

  const groups: Group[] = useMemo(() => {
    const map = new Map<GroupKey, Group>();

    for (const e of entries) {
      const ws = toISODate(startOfWeekSunday(new Date(e.entry_date + "T00:00:00")));
      const we = toISODate(addDays(startOfWeekSunday(new Date(e.entry_date + "T00:00:00")), 6));
      const key = `${e.user_id}|${ws}`;

      if (!map.has(key)) {
        map.set(key, { key, user_id: e.user_id, week_start: ws, week_end: we, entries: [] });
      }
      map.get(key)!.entries.push(e);
    }

    return Array.from(map.values()).sort((a, b) => (a.user_id + a.week_start).localeCompare(b.user_id + b.week_start));
  }, [entries]);

  async function approveGroup(g: Group) {
    setBusyKey(g.key);
    setMsg("");

    try {
      const { error } = await supabase
        .from("time_entries")
        .update({ status: "approved" })
        .eq("user_id", g.user_id)
        .gte("entry_date", g.week_start)
        .lte("entry_date", g.week_end)
        .eq("status", "submitted");

      if (error) {
        setMsg(error.message);
        return;
      }

      setEntries((prev) => prev.filter((x) => !(x.user_id === g.user_id && x.entry_date >= g.week_start && x.entry_date <= g.week_end)));
      setMsg("Approved ✅");
    } finally {
      setBusyKey("");
    }
  }

  async function rejectGroup(g: Group) {
    setBusyKey(g.key);
    setMsg("");

    try {
      const { error } = await supabase
        .from("time_entries")
        .update({ status: "rejected" })
        .eq("user_id", g.user_id)
        .gte("entry_date", g.week_start)
        .lte("entry_date", g.week_end)
        .eq("status", "submitted");

      if (error) {
        setMsg(error.message);
        return;
      }

      setEntries((prev) => prev.filter((x) => !(x.user_id === g.user_id && x.entry_date >= g.week_start && x.entry_date <= g.week_end)));
      setMsg("Rejected (sent back editable) ✅");
    } finally {
      setBusyKey("");
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (profLoading) {
    return (
      <main style={{ maxWidth: 1100, margin: "24px auto", padding: 16 }}>
        <h1>Approvals</h1>
        <p>Loading…</p>
      </main>
    );
  }

  if (!profile || !userId) {
    return (
      <main style={{ maxWidth: 1100, margin: "24px auto", padding: 16 }}>
        <h1>Approvals</h1>
        <p>Please log in.</p>
        <button onClick={() => router.push("/login")}>Go to Login</button>
      </main>
    );
  }

  if (!isManagerOrAdmin) {
    return (
      <main style={{ maxWidth: 1100, margin: "24px auto", padding: 16 }}>
        <h1>Approvals</h1>
        <p style={{ color: "#b00", marginTop: 10 }}>Manager/Admin only.</p>
        <button onClick={() => router.push("/dashboard")} style={{ marginTop: 10 }}>
          Back to Dashboard
        </button>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1100, margin: "24px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0 }}>Approvals</h1>
          <div style={{ opacity: 0.75, marginTop: 6 }}>
            Week: {weekRangeLabel(weekStart)} • Scope: {isAdmin ? "Org" : "My team"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={() => router.push("/timesheet")}>My Timesheet</button>
          <button onClick={() => router.push("/dashboard")}>Dashboard</button>
          <button onClick={() => router.push("/profiles")}>Profiles</button>
          <button onClick={() => router.push("/projects")}>Projects</button>
          {profile.role === "admin" ? <button onClick={() => router.push("/admin")}>Admin</button> : null}
          <button onClick={logout}>Logout</button>
        </div>
      </div>

      {msg ? (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #eee", borderRadius: 12, background: "#fafafa" }}>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{msg}</pre>
        </div>
      ) : null}

      <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={() => setWeekStart((d) => addDays(d, -7))}>← Prev</button>
        <button onClick={() => setWeekStart(startOfWeekSunday(new Date()))}>This week</button>
        <button onClick={() => setWeekStart((d) => addDays(d, 7))}>Next →</button>
      </div>

      <div style={{ marginTop: 14 }}>
        {groups.length === 0 ? (
          <div style={{ opacity: 0.8 }}>No submitted entries for this week.</div>
        ) : (
          groups.map((g) => {
            const name = profiles[g.user_id]?.full_name ?? g.user_id;
            const total = g.entries.reduce((a, b) => a + (b.hours_worked ?? 0), 0);

            return (
              <section key={g.key} style={{ marginBottom: 14, border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{name}</div>
                    <div style={{ opacity: 0.75, marginTop: 4 }}>
                      {g.week_start} → {g.week_end} • Submitted lines: {g.entries.length} • Total: {total.toFixed(2)} hrs
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button disabled={busyKey === g.key} onClick={() => rejectGroup(g)}>
                      {busyKey === g.key ? "Working…" : "Reject"}
                    </button>
                    <button disabled={busyKey === g.key} onClick={() => approveGroup(g)} style={{ fontWeight: 900 }}>
                      {busyKey === g.key ? "Working…" : "Approve"}
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 10, opacity: 0.9 }}>
                  {g.entries.map((e) => (
                    <div key={e.id} style={{ padding: "8px 0", borderTop: "1px solid #f0f0f0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div>
                          <strong>{e.entry_date}</strong>{" "}
                          <span style={{ opacity: 0.8 }}>• {projects[e.project_id]?.name ?? e.project_id}</span>
                          {e.notes ? <span style={{ opacity: 0.8 }}> • {e.notes}</span> : null}
                        </div>
                        <div style={{ fontWeight: 800 }}>{(e.hours_worked ?? 0).toFixed(2)} hrs</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}

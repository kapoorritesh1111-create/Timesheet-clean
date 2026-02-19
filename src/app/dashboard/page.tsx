// src/app/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseBrowser";
import { useProfile } from "../../lib/useProfile";
import { addDays, startOfWeekSunday, toISODate } from "../../lib/date";

type EntryStatus = "draft" | "submitted" | "approved" | "rejected";

type EntryRow = {
  id: string;
  user_id: string;
  entry_date: string; // YYYY-MM-DD
  hours_worked: number | null;
  status: EntryStatus;
  notes: string | null;
};

type TeamMember = { id: string; full_name: string | null; role: string | null };

function startOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + 1, 0);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function DashboardPage() {
  const router = useRouter();
  const { loading: profLoading, profile, userId, error: profErr } = useProfile();

  const [myRows, setMyRows] = useState<EntryRow[]>([]);
  const [msg, setMsg] = useState("");
  const [loadingRows, setLoadingRows] = useState(false);

  // NEW: team view state
  const [teamRows, setTeamRows] = useState<EntryRow[]>([]);
  const [teamMembers, setTeamMembers] = useState<Record<string, TeamMember>>({});
  const [loadingTeam, setLoadingTeam] = useState(false);

  const isManagerOrAdmin = profile?.role === "admin" || profile?.role === "manager";
  const isAdmin = profile?.role === "admin";
  const isManager = profile?.role === "manager";

  const now = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => startOfWeekSunday(now), [now]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const monthStart = useMemo(() => startOfMonth(now), [now]);
  const monthEnd = useMemo(() => endOfMonth(now), [now]);

  const weekStartISO = useMemo(() => toISODate(weekStart), [weekStart]);
  const weekEndISO = useMemo(() => toISODate(weekEnd), [weekEnd]);
  const monthStartISO = useMemo(() => toISODate(monthStart), [monthStart]);
  const monthEndISO = useMemo(() => toISODate(monthEnd), [monthEnd]);

  // Load my recent entries
  useEffect(() => {
    if (!profile || !userId) return;

    let cancelled = false;
    (async () => {
      setLoadingRows(true);
      setMsg("");

      const { data, error } = await supabase
        .from("v_time_entries")
        .select("id, user_id, entry_date, hours_worked, status, notes")
        .eq("user_id", userId)
        .order("entry_date", { ascending: false })
        .limit(60);

      if (cancelled) return;

      if (error) {
        setMsg(error.message);
        setMyRows([]);
        setLoadingRows(false);
        return;
      }

      setMyRows(((data as any) ?? []) as EntryRow[]);
      setLoadingRows(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [profile, userId]);

  // NEW: Load team overview entries
  useEffect(() => {
    if (!profile || !userId) return;
    if (!isManagerOrAdmin) return;

    let cancelled = false;
    (async () => {
      setLoadingTeam(true);

      // Determine scope IDs
      let scopedUserIds: string[] = [];

      if (isAdmin) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, role")
          .eq("org_id", profile.org_id)
          .eq("is_active", true)
          .in("role", ["contractor", "manager"])
          .order("full_name", { ascending: true });

        const list = ((profs as any) ?? []) as TeamMember[];
        const map: Record<string, TeamMember> = {};
        for (const p of list) map[p.id] = p;
        if (!cancelled) setTeamMembers(map);

        scopedUserIds = list.map((x) => x.id).filter((x) => x !== userId);
      } else {
        // Manager: direct reports
        const { data: team, error: teamErr } = await supabase
          .from("profiles")
          .select("id, full_name, role")
          .eq("org_id", profile.org_id)
          .eq("manager_id", userId)
          .eq("is_active", true)
          .order("full_name", { ascending: true });

        if (teamErr) {
          if (!cancelled) {
            setMsg((m) => (m ? `${m}\n${teamErr.message}` : teamErr.message));
            setLoadingTeam(false);
          }
          return;
        }

        const list = ((team as any) ?? []) as TeamMember[];
        const map: Record<string, TeamMember> = {};
        for (const p of list) map[p.id] = p;
        if (!cancelled) setTeamMembers(map);

        scopedUserIds = list.map((x) => x.id);
      }

      if (scopedUserIds.length === 0) {
        if (!cancelled) {
          setTeamRows([]);
          setLoadingTeam(false);
        }
        return;
      }

      // Pull this week + this month (lightweight: last 60 days)
      const { data: rows, error } = await supabase
        .from("v_time_entries")
        .select("id, user_id, entry_date, hours_worked, status, notes")
        .in("user_id", scopedUserIds)
        .gte("entry_date", toISODate(addDays(now, -60)))
        .lte("entry_date", monthEndISO)
        .order("entry_date", { ascending: false })
        .limit(2000);

      if (!cancelled) {
        if (error) {
          setMsg((m) => (m ? `${m}\n${error.message}` : error.message));
          setTeamRows([]);
          setLoadingTeam(false);
          return;
        }
        setTeamRows(((rows as any) ?? []) as EntryRow[]);
        setLoadingTeam(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile, userId, isManagerOrAdmin, isAdmin, isManager, monthEndISO, now]);

  const weekTotals = useMemo(() => {
    let total = 0;
    let approved = 0;
    let submitted = 0;
    let draft = 0;
    let rejected = 0;

    for (const r of myRows) {
      if (r.entry_date < weekStartISO || r.entry_date > weekEndISO) continue;
      const hrs = Number(r.hours_worked ?? 0);
      total += hrs;
      if (r.status === "approved") approved += hrs;
      if (r.status === "submitted") submitted += hrs;
      if (r.status === "draft") draft += hrs;
      if (r.status === "rejected") rejected += hrs;
    }

    return { total, approved, submitted, draft, rejected };
  }, [myRows, weekStartISO, weekEndISO]);

  const monthTotals = useMemo(() => {
    let total = 0;
    let approved = 0;
    let submitted = 0;

    for (const r of myRows) {
      if (r.entry_date < monthStartISO || r.entry_date > monthEndISO) continue;
      const hrs = Number(r.hours_worked ?? 0);
      total += hrs;
      if (r.status === "approved") approved += hrs;
      if (r.status === "submitted") submitted += hrs;
    }

    const rate = Number(profile?.hourly_rate ?? 0);
    const estPayApproved = rate ? approved * rate : 0;

    return { total, approved, submitted, rate, estPayApproved };
  }, [myRows, monthStartISO, monthEndISO, profile?.hourly_rate]);

  // NEW: team rollups
  const teamWeek = useMemo(() => {
    const byUser: Record<string, number> = {};
    let pendingSubmissions = 0;

    for (const r of teamRows) {
      if (r.entry_date < weekStartISO || r.entry_date > weekEndISO) continue;
      const hrs = Number(r.hours_worked ?? 0);
      byUser[r.user_id] = (byUser[r.user_id] ?? 0) + hrs;
      if (r.status === "submitted") pendingSubmissions += 1;
    }

    const ranked = Object.entries(byUser)
      .map(([uid, hrs]) => ({ uid, hrs }))
      .sort((a, b) => b.hrs - a.hrs);

    const total = ranked.reduce((a, b) => a + b.hrs, 0);

    return { total, ranked, pendingSubmissions };
  }, [teamRows, weekStartISO, weekEndISO]);

  const teamMonth = useMemo(() => {
    const byUser: Record<string, number> = {};
    for (const r of teamRows) {
      if (r.entry_date < monthStartISO || r.entry_date > monthEndISO) continue;
      const hrs = Number(r.hours_worked ?? 0);
      byUser[r.user_id] = (byUser[r.user_id] ?? 0) + hrs;
    }
    const total = Object.values(byUser).reduce((a, b) => a + b, 0);
    return { total };
  }, [teamRows, monthStartISO, monthEndISO]);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (profLoading) {
    return (
      <main style={{ maxWidth: 1100, margin: "24px auto", padding: 16 }}>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <p>Loading…</p>
      </main>
    );
  }

    // If no auth session at all → login
  if (!userId) {
    return (
      <main style={{ maxWidth: 1100, margin: "24px auto", padding: 16 }}>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <p style={{ marginTop: 10 }}>Please log in.</p>
        <button onClick={() => router.push("/login")}>Go to Login</button>
      </main>
    );
  }

  // If session exists but profile is missing/blocked → show real error
  if (!profile) {
    return (
      <main style={{ maxWidth: 1100, margin: "24px auto", padding: 16 }}>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <p style={{ marginTop: 10, fontWeight: 800 }}>
          You are logged in, but your profile could not be loaded.
        </p>

        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 12,
            background: "#fafafa",
          }}
        >
          <div style={{ fontWeight: 900 }}>What this means</div>
          <ul style={{ marginTop: 8, marginBottom: 0 }}>
            <li>Your `profiles` table is missing a row for this user, <b>or</b></li>
            <li>Row Level Security (RLS) is blocking profile reads.</li>
          </ul>

          <div style={{ marginTop: 10, fontWeight: 900 }}>Details:</div>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{profErr || "No error details returned."}</pre>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => router.push("/login")}>Back to Login</button>
          <button onClick={() => supabase.auth.signOut().then(() => router.push("/login"))}>Logout</button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1100, margin: "24px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Dashboard</h1>
          <div style={{ opacity: 0.75, marginTop: 6 }}>
            {profile.full_name ? `Hi, ${profile.full_name}` : "Hi"} • Role: {profile.role}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={() => router.push("/timesheet")}>Timesheet</button>
          <button onClick={() => router.push("/projects")}>Projects</button>
          <button onClick={() => router.push("/profiles")}>Profiles</button>
          {isManagerOrAdmin ? <button onClick={() => router.push("/approvals")}>Approvals</button> : null}
          {profile.role === "admin" ? <button onClick={() => router.push("/admin")}>Admin</button> : null}
          <button onClick={logout}>Logout</button>
        </div>
      </div>

      {profErr ? (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #f2c", borderRadius: 12, background: "#fff7fb" }}>
          <strong>Profile error:</strong> {profErr}
        </div>
      ) : null}

      {msg ? (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #eee", borderRadius: 12, background: "#fafafa" }}>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{msg}</pre>
        </div>
      ) : null}

      {/* KPI Cards */}
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
          <div style={{ fontWeight: 800, opacity: 0.8 }}>This Week</div>
          <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6 }}>{weekTotals.total.toFixed(2)} hrs</div>
          <div style={{ opacity: 0.75, marginTop: 6 }}>
            Approved {weekTotals.approved.toFixed(2)} • Submitted {weekTotals.submitted.toFixed(2)}
          </div>
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
          <div style={{ fontWeight: 800, opacity: 0.8 }}>This Month</div>
          <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6 }}>{monthTotals.total.toFixed(2)} hrs</div>
          <div style={{ opacity: 0.75, marginTop: 6 }}>
            Approved {monthTotals.approved.toFixed(2)} • Submitted {monthTotals.submitted.toFixed(2)}
          </div>
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
          <div style={{ fontWeight: 800, opacity: 0.8 }}>Hourly Rate</div>
          <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6 }}>
            {monthTotals.rate ? `$${monthTotals.rate.toFixed(2)}` : "—"}
          </div>
          <div style={{ opacity: 0.75, marginTop: 6 }}>From your profile</div>
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
          <div style={{ fontWeight: 800, opacity: 0.8 }}>Est. Pay (Approved)</div>
          <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6 }}>
            {monthTotals.rate ? `$${monthTotals.estPayApproved.toFixed(2)}` : "—"}
          </div>
          <div style={{ opacity: 0.75, marginTop: 6 }}>This month (approved hours only)</div>
        </div>
      </div>

      {/* NEW: Manager view */}
      {isManagerOrAdmin ? (
        <div style={{ marginTop: 16, border: "1px solid #e6f0ff", borderRadius: 14, padding: 12, background: "#f6f9ff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Team Overview</div>
              <div style={{ opacity: 0.75, marginTop: 4 }}>
                Scope: {isAdmin ? "Org" : "Direct reports"} • Week: {weekStartISO} → {weekEndISO}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => router.push("/approvals")} style={{ fontWeight: 900 }}>
                Approvals
              </button>
              <button onClick={() => router.push("/profiles")}>Profiles</button>
              <button onClick={() => router.push("/projects")}>Projects</button>
            </div>
          </div>

          {loadingTeam ? (
            <div style={{ marginTop: 10 }}>Loading team…</div>
          ) : (
            <>
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                <div style={{ border: "1px solid #dbe7ff", borderRadius: 14, padding: 12, background: "#fff" }}>
                  <div style={{ fontWeight: 800, opacity: 0.8 }}>Team Hours (Week)</div>
                  <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6 }}>{teamWeek.total.toFixed(2)} hrs</div>
                </div>
                <div style={{ border: "1px solid #dbe7ff", borderRadius: 14, padding: 12, background: "#fff" }}>
                  <div style={{ fontWeight: 800, opacity: 0.8 }}>Team Hours (Month)</div>
                  <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6 }}>{teamMonth.total.toFixed(2)} hrs</div>
                </div>
                <div style={{ border: "1px solid #dbe7ff", borderRadius: 14, padding: 12, background: "#fff" }}>
                  <div style={{ fontWeight: 800, opacity: 0.8 }}>Pending Submitted Lines</div>
                  <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6 }}>{teamWeek.pendingSubmissions}</div>
                  <div style={{ opacity: 0.75, marginTop: 6 }}>Go to Approvals to clear</div>
                </div>
              </div>

              <div style={{ marginTop: 12, borderTop: "1px solid #dbe7ff", paddingTop: 12 }}>
                <div style={{ fontWeight: 900 }}>Top hours this week</div>
                {teamWeek.ranked.length === 0 ? (
                  <div style={{ opacity: 0.8, marginTop: 6 }}>No team hours logged this week yet.</div>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    {teamWeek.ranked.slice(0, 8).map((x) => (
                      <div key={x.uid} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #eef4ff" }}>
                        <div style={{ fontWeight: 800 }}>
                          {teamMembers[x.uid]?.full_name || x.uid}
                        </div>
                        <div style={{ fontWeight: 900 }}>{x.hrs.toFixed(2)} hrs</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* Recent Entries */}
      <div style={{ marginTop: 16, border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Recent Entries</div>
            <div style={{ opacity: 0.75, marginTop: 4 }}>Showing your last {Math.min(myRows.length, 60)} lines</div>
          </div>

          <button onClick={() => router.push("/timesheet")} style={{ fontWeight: 800 }}>
            Open Weekly Timesheet →
          </button>
        </div>

        {loadingRows ? (
          <div style={{ marginTop: 10 }}>Loading entries…</div>
        ) : myRows.length === 0 ? (
          <div style={{ marginTop: 10, opacity: 0.8 }}>No entries yet.</div>
        ) : (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "120px 100px 110px 1fr", gap: 10, fontWeight: 800, opacity: 0.8 }}>
              <div>Date</div>
              <div>Hours</div>
              <div>Status</div>
              <div>Notes</div>
            </div>

            {myRows.map((r) => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "120px 100px 110px 1fr", gap: 10, padding: "10px 0", borderTop: "1px solid #f0f0f0" }}>
                <div style={{ fontWeight: 700 }}>{r.entry_date}</div>
                <div>{Number(r.hours_worked ?? 0).toFixed(2)}</div>
                <div style={{ opacity: 0.85 }}>{r.status}</div>
                <div style={{ opacity: 0.9 }}>{r.notes ?? ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

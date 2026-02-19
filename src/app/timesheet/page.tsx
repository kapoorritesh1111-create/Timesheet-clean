// src/app/timesheet/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseBrowser";
import { useProfile } from "../../lib/useProfile";
import { addDays, formatShort, startOfWeekSunday, toISODate, weekRangeLabel } from "../../lib/date";

type Project = {
  id: string;
  name: string;
  parent_id?: string | null;
  is_active?: boolean | null;
};

type EntryStatus = "draft" | "submitted" | "approved" | "rejected";

type TimeEntryRow = {
  id: string;
  entry_date: string; // YYYY-MM-DD
  project_id: string;
  time_in: string | null;   // "HH:MM:SS" from Postgres time
  time_out: string | null;
  lunch_hours: number | null;
  mileage: number | null;
  notes: string | null;
  status: EntryStatus;
  hours_worked?: number | null; // from view
};

type DraftRow = {
  id?: string;
  tempId: string;
  entry_date: string;
  project_id: string;
  time_in: string;   // "HH:MM"
  time_out: string;  // "HH:MM"
  lunch_hours: number;
  mileage: number;
  notes: string;
  status?: EntryStatus; // server truth when loaded
};

function timeToHHMM(t: string | null): string {
  if (!t) return "";
  return t.slice(0, 5);
}

function normalizeHHMM(s: string): string {
  if (!s) return "";
  const [hRaw, mRaw] = s.split(":");
  const h = String(Number(hRaw ?? 0)).padStart(2, "0");
  const m = String(Number(mRaw ?? 0)).padStart(2, "0");
  return `${h}:${m}`;
}

export default function TimesheetPage() {
  const router = useRouter();
  const { loading: profLoading, profile, userId } = useProfile();

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekSunday(new Date()));
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekStartISO = useMemo(() => toISODate(weekStart), [weekStart]);
  const weekEndISO = useMemo(() => toISODate(addDays(weekStart, 6)), [weekStart]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [loadingWeek, setLoadingWeek] = useState(false);

  const canView = !!userId && !!profile;

  // Load projects + entries for the week
  useEffect(() => {
    if (!canView) return;

    let cancelled = false;
    (async () => {
      setLoadingWeek(true);
      setMsg("");

      // Model B: projects come from membership.
      // Requires FK: project_members.project_id -> projects.id
      try {
        const { data: pm, error: pmErr } = await supabase
          .from("project_members")
          .select("project_id, projects(id, name, parent_id, is_active)")
          .eq("profile_id", userId!)
          .eq("is_active", true);

        if (!cancelled) {
          if (pmErr) {
            // fallback to old behavior if schema/relations not ready
            setMsg(pmErr.message);
            const { data: projRows, error: projErr } = await supabase
              .from("projects")
              .select("id, name, parent_id, is_active")
              .eq("is_active", true)
              .order("name", { ascending: true });

            if (!projErr) setProjects(((projRows as any) ?? []) as Project[]);
          } else {
            const list = (((pm as any) ?? []) as any[])
              .map((x) => x.projects)
              .filter(Boolean) as Project[];
            setProjects(list.filter((p) => p.is_active !== false).sort((a, b) => a.name.localeCompare(b.name)));
          }
        }
      } catch (e: any) {
        if (!cancelled) setMsg(e?.message || "Failed to load projects");
      }

      // Existing entries (use view so we get hours_worked)
      const { data: entryRows, error: entryErr } = await supabase
        .from("v_time_entries")
        .select("id, entry_date, project_id, time_in, time_out, lunch_hours, mileage, notes, status, hours_worked")
        .gte("entry_date", weekStartISO)
        .lte("entry_date", weekEndISO)
        .order("entry_date", { ascending: true });

      if (!cancelled) {
        if (entryErr) {
          setMsg((m) => (m ? `${m}\n${entryErr.message}` : entryErr.message));
          setRows([]);
          setLoadingWeek(false);
          return;
        }

        const mapped: DraftRow[] = (((entryRows as any) ?? []) as TimeEntryRow[]).map((r) => ({
          id: r.id,
          tempId: r.id,
          entry_date: r.entry_date,
          project_id: r.project_id,
          time_in: timeToHHMM(r.time_in),
          time_out: timeToHHMM(r.time_out),
          lunch_hours: Number(r.lunch_hours ?? 0),
          mileage: Number(r.mileage ?? 0),
          notes: r.notes ?? "",
          status: r.status,
        }));

        setRows(mapped);
        setLoadingWeek(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canView, userId, weekStartISO, weekEndISO]);

  const hoursByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of weekDays) map[toISODate(d)] = 0;

    for (const r of rows) {
      const dayKey = r.entry_date;
      const tin = r.time_in ? normalizeHHMM(r.time_in) : "";
      const tout = r.time_out ? normalizeHHMM(r.time_out) : "";
      if (!tin || !tout) continue;

      const [h1, m1] = tin.split(":").map(Number);
      const [h2, m2] = tout.split(":").map(Number);
      if ([h1, m1, h2, m2].some((x) => Number.isNaN(x))) continue;

      const start = h1 * 60 + m1;
      const end = h2 * 60 + m2;
      const minutes = Math.max(end - start, 0);
      const hours = Math.max(minutes / 60 - (r.lunch_hours ?? 0), 0);

      map[dayKey] = (map[dayKey] ?? 0) + hours;
    }
    return map;
  }, [rows, weekDays]);

  const weekTotal = useMemo(() => Object.values(hoursByDay).reduce((a, b) => a + b, 0), [hoursByDay]);

  function addLine(entryDateISO: string) {
    const tempId = `tmp_${crypto.randomUUID()}`;
    const firstProject = projects[0]?.id ?? "";
    setRows((prev) => [
      ...prev,
      {
        tempId,
        entry_date: entryDateISO,
        project_id: firstProject,
        time_in: "",
        time_out: "",
        lunch_hours: 0,
        mileage: 0,
        notes: "",
        status: "draft",
      },
    ]);
  }

  function removeLine(tempId: string) {
    setRows((prev) => prev.filter((r) => r.tempId !== tempId));
  }

  function updateRow(tempId: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.tempId === tempId ? { ...r, ...patch } : r)));
  }

  async function saveDraft() {
    if (!userId || !profile) return;

    setBusy(true);
    setMsg("");

    try {
      const weekRows = rows.filter((r) => r.entry_date >= weekStartISO && r.entry_date <= weekEndISO);

      const results = await Promise.all(
        weekRows.map(async (r) => {
          const hasAnyInput =
            !!r.project_id ||
            !!r.time_in ||
            !!r.time_out ||
            (r.lunch_hours ?? 0) > 0 ||
            (r.mileage ?? 0) > 0 ||
            !!r.notes;

          if (!hasAnyInput) return { ok: true, skipped: true };
          if (!r.project_id) return { ok: false, error: `Project required for ${r.entry_date}` };
          if (r.status === "submitted" || r.status === "approved") return { ok: true, skipped: true };

          const payload = {
            org_id: profile.org_id,
            user_id: userId,
            entry_date: r.entry_date,
            project_id: r.project_id,
            time_in: r.time_in ? normalizeHHMM(r.time_in) + ":00" : null,
            time_out: r.time_out ? normalizeHHMM(r.time_out) + ":00" : null,
            lunch_hours: r.lunch_hours ?? 0,
            mileage: r.mileage ?? 0,
            notes: r.notes ?? null,
            status: (r.status === "rejected" ? "draft" : (r.status ?? "draft")) as EntryStatus,
          };

          if (r.id) {
            const { error } = await supabase.from("time_entries").update(payload).eq("id", r.id);
            if (error) return { ok: false, error: error.message };
            return { ok: true };
          } else {
            const { data, error } = await supabase.from("time_entries").insert(payload).select("id").single();
            if (error) return { ok: false, error: error.message };
            updateRow(r.tempId, { id: data.id, tempId: data.id });
            return { ok: true };
          }
        })
      );

      const errors = results.filter((x: any) => !x.ok).map((x: any) => x.error);
      setMsg(errors.length ? errors.join("\n") : "Saved ✅");
    } finally {
      setBusy(false);
    }
  }

  async function submitWeek() {
    if (!userId) return;

    setBusy(true);
    setMsg("");

    try {
      const { error } = await supabase
        .from("time_entries")
        .update({ status: "submitted" })
        .eq("user_id", userId)
        .gte("entry_date", weekStartISO)
        .lte("entry_date", weekEndISO)
        .in("status", ["draft", "rejected"]);

      if (error) {
        setMsg(error.message);
        return;
      }

      const { data: entryRows, error: entryErr } = await supabase
        .from("v_time_entries")
        .select("id, entry_date, project_id, time_in, time_out, lunch_hours, mileage, notes, status, hours_worked")
        .gte("entry_date", weekStartISO)
        .lte("entry_date", weekEndISO)
        .order("entry_date", { ascending: true });

      if (entryErr) {
        setMsg(`Submitted, but reload failed: ${entryErr.message}`);
        return;
      }

      const mapped: DraftRow[] = (((entryRows as any) ?? []) as TimeEntryRow[]).map((r) => ({
        id: r.id,
        tempId: r.id,
        entry_date: r.entry_date,
        project_id: r.project_id,
        time_in: timeToHHMM(r.time_in),
        time_out: timeToHHMM(r.time_out),
        lunch_hours: Number(r.lunch_hours ?? 0),
        mileage: Number(r.mileage ?? 0),
        notes: r.notes ?? "",
        status: r.status,
      }));

      setRows(mapped);
      setMsg("Week submitted ✅");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (profLoading) {
    return (
      <main style={{ maxWidth: 1100, margin: "24px auto", padding: 16 }}>
        <h1 style={{ margin: 0 }}>Timesheet</h1>
        <p>Loading…</p>
      </main>
    );
  }

  if (!profile || !userId) {
    return (
      <main style={{ maxWidth: 1100, margin: "24px auto", padding: 16 }}>
        <h1 style={{ margin: 0 }}>Timesheet</h1>
        <p style={{ marginTop: 10 }}>Please log in.</p>
        <button onClick={() => router.push("/login")}>Go to Login</button>
      </main>
    );
  }

  const isManagerOrAdmin = profile.role === "admin" || profile.role === "manager";

  return (
    <main style={{ maxWidth: 1100, margin: "24px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0 }}>Weekly Timesheet</h1>
          <div style={{ opacity: 0.75, marginTop: 6 }}>
            {weekRangeLabel(weekStart)} • Role: {profile.role}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={() => router.push("/dashboard")}>Dashboard</button>
          {isManagerOrAdmin ? <button onClick={() => router.push("/approvals")}>Approvals</button> : null}
          <button onClick={() => router.push("/projects")}>Projects</button>
          <button onClick={() => router.push("/profiles")}>Profiles</button>
          {profile.role === "admin" ? <button onClick={() => router.push("/admin")}>Admin</button> : null}
          <button onClick={logout}>Logout</button>
        </div>
      </div>

      {msg ? (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #eee", borderRadius: 12, background: "#fafafa" }}>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{msg}</pre>
        </div>
      ) : null}

      <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => setWeekStart((d) => addDays(d, -7))}>← Prev</button>
        <button onClick={() => setWeekStart(startOfWeekSunday(new Date()))}>This week</button>
        <button onClick={() => setWeekStart((d) => addDays(d, 7))}>Next →</button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button disabled={busy || loadingWeek} onClick={saveDraft}>
            {busy ? "Saving…" : "Save Draft"}
          </button>
          <button disabled={busy || loadingWeek} onClick={submitWeek} style={{ fontWeight: 800 }}>
            {busy ? "Working…" : "Submit Week"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 14, padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
        <div style={{ fontWeight: 800 }}>Week total: {weekTotal.toFixed(2)} hrs</div>
        <div style={{ opacity: 0.7, marginTop: 4 }}>
          You can add multiple lines per day (Option A). Projects are membership-based (Model B).
        </div>
      </div>

      {loadingWeek ? (
        <div style={{ marginTop: 14 }}>Loading week…</div>
      ) : (
        <div style={{ marginTop: 14 }}>
          {weekDays.map((day) => {
            const dayISO = toISODate(day);
            const dayRows = rows.filter((r) => r.entry_date === dayISO);

            return (
              <section key={dayISO} style={{ marginBottom: 14, border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>
                    {formatShort(day)} <span style={{ opacity: 0.7 }}>({dayISO})</span>
                  </div>
                  <div style={{ fontWeight: 800 }}>Day total: {(hoursByDay[dayISO] ?? 0).toFixed(2)} hrs</div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "220px 90px 90px 90px 1fr 90px 90px", gap: 8, fontWeight: 800, opacity: 0.8 }}>
                    <div>Project</div>
                    <div>In</div>
                    <div>Out</div>
                    <div>Lunch</div>
                    <div>Notes</div>
                    <div>Miles</div>
                    <div>Status</div>
                  </div>

                  {dayRows.length === 0 ? <div style={{ marginTop: 10, opacity: 0.75 }}>No lines for this day.</div> : null}

                  {dayRows.map((r) => {
                    const locked = r.status === "submitted" || r.status === "approved";

                    return (
                      <div
                        key={r.tempId}
                        style={{
                          marginTop: 8,
                          display: "grid",
                          gridTemplateColumns: "220px 90px 90px 90px 1fr 90px 90px",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <select
                          value={r.project_id}
                          disabled={locked}
                          onChange={(e) => updateRow(r.tempId, { project_id: e.target.value })}
                          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                        >
                          <option value="">Select…</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>

                        <input
                          value={r.time_in}
                          disabled={locked}
                          onChange={(e) => updateRow(r.tempId, { time_in: e.target.value })}
                          placeholder="HH:MM"
                          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                        />

                        <input
                          value={r.time_out}
                          disabled={locked}
                          onChange={(e) => updateRow(r.tempId, { time_out: e.target.value })}
                          placeholder="HH:MM"
                          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                        />

                        <input
                          value={r.lunch_hours}
                          disabled={locked}
                          onChange={(e) => updateRow(r.tempId, { lunch_hours: Number(e.target.value) })}
                          type="number"
                          min="0"
                          step="0.25"
                          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                        />

                        <input
                          value={r.notes}
                          disabled={locked}
                          onChange={(e) => updateRow(r.tempId, { notes: e.target.value })}
                          placeholder="What did you work on?"
                          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                        />

                        <input
                          value={r.mileage}
                          disabled={locked}
                          onChange={(e) => updateRow(r.tempId, { mileage: Number(e.target.value) })}
                          type="number"
                          min="0"
                          step="0.1"
                          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                        />

                        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ opacity: 0.8 }}>{r.status ?? "draft"}</span>
                          {!locked ? (
                            <button onClick={() => removeLine(r.tempId)} style={{ padding: "6px 10px" }}>
                              ✕
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ marginTop: 10 }}>
                    <button onClick={() => addLine(dayISO)}>+ Add line</button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

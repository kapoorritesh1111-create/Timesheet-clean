// src/app/profiles/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseBrowser";
import { useProfile } from "../../lib/useProfile";

type Role = "admin" | "manager" | "contractor";

type ProfileRow = {
  id: string;
  org_id: string;
  role: Role;
  full_name: string | null;
  hourly_rate: number | null;
  is_active: boolean | null;
  manager_id: string | null;
};

export default function ProfilesPage() {
  const router = useRouter();
  const { loading: profLoading, profile, userId } = useProfile();

  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<string>("");

  const isAdmin = profile?.role === "admin";
  const isManager = profile?.role === "manager";

  const visibleRows = useMemo(() => {
    if (!profile || !userId) return [];
    if (isAdmin) return rows;

    // Manager sees self + direct reports
    if (isManager) return rows.filter((r) => r.id === userId || r.manager_id === userId);

    // Contractor sees self only
    return rows.filter((r) => r.id === userId);
  }, [rows, profile, userId, isAdmin, isManager]);

  const managers = useMemo(() => {
    return rows
      .filter((r) => r.role === "manager" || r.role === "admin")
      .filter((r) => r.is_active !== false)
      .sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || "")));
  }, [rows]);

  useEffect(() => {
    if (!profile?.org_id) return;

    let cancelled = false;
    (async () => {
      setMsg("");
      const { data, error } = await supabase
        .from("profiles")
        .select("id, org_id, role, full_name, hourly_rate, is_active, manager_id")
        .eq("org_id", profile.org_id)
        .order("role", { ascending: true })
        .order("full_name", { ascending: true });

      if (cancelled) return;

      if (error) {
        setMsg(error.message);
        setRows([]);
        return;
      }

      setRows(((data as any) ?? []) as ProfileRow[]);
    })();

    return () => {
      cancelled = true;
    };
  }, [profile?.org_id]);

  async function saveRow(id: string, patch: Partial<ProfileRow>) {
    setBusyId(id);
    setMsg("");

    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) {
      setMsg(error.message);
      setBusyId("");
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setBusyId("");
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (profLoading) {
    return (
      <main style={{ maxWidth: 1100, margin: "24px auto", padding: 16 }}>
        <h1>Profiles</h1>
        <p>Loading…</p>
      </main>
    );
  }

  if (!profile || !userId) {
    return (
      <main style={{ maxWidth: 1100, margin: "24px auto", padding: 16 }}>
        <h1>Profiles</h1>
        <p>Please log in.</p>
        <button onClick={() => router.push("/login")}>Go to Login</button>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1100, margin: "24px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <div>
          <h1 style={{ margin: 0 }}>Profiles</h1>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            {isAdmin ? "Admin view (all users)" : isManager ? "Manager view (your team)" : "Your profile"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => router.push("/dashboard")}>Dashboard</button>
          <button onClick={() => router.push("/timesheet")}>Timesheet</button>
          <button onClick={() => router.push("/projects")}>Projects</button>
          {isAdmin ? <button onClick={() => router.push("/admin")}>Admin</button> : null}
          <button onClick={logout}>Logout</button>
        </div>
      </div>

      {msg ? (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #eee", borderRadius: 12, background: "#fafafa" }}>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{msg}</pre>
        </div>
      ) : null}

      <div style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 14, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "260px 130px 160px 140px 140px 1fr",
            gap: 10,
            padding: 12,
            fontWeight: 900,
            background: "#fafafa",
            borderBottom: "1px solid #eee",
          }}
        >
          <div>Name</div>
          <div>Role</div>
          <div>Manager</div>
          <div>Hourly rate</div>
          <div>Status</div>
          <div>Actions</div>
        </div>

        {visibleRows.map((r) => {
          const isSelf = r.id === userId;
          const canEdit = isAdmin || (isManager && (isSelf || r.manager_id === userId)) || isSelf;
          const canAssignManager = isAdmin && r.role === "contractor";
          const canChangeRole = isAdmin && r.role !== "admin"; // keep admin stable

          return (
            <div
              key={r.id}
              style={{
                display: "grid",
                gridTemplateColumns: "260px 130px 160px 140px 140px 1fr",
                gap: 10,
                padding: 12,
                borderTop: "1px solid #f0f0f0",
                alignItems: "center",
              }}
            >
              <input
                value={r.full_name ?? ""}
                disabled={!canEdit}
                onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, full_name: e.target.value } : x)))}
                placeholder="Full name"
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", background: canEdit ? "#fff" : "#f6f6f6" }}
              />

              <select
                value={r.role}
                disabled={!canChangeRole}
                onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, role: e.target.value as Role } : x)))}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", background: canChangeRole ? "#fff" : "#f6f6f6" }}
              >
                <option value="contractor">contractor</option>
                <option value="manager">manager</option>
                {isAdmin ? <option value="admin">admin</option> : null}
              </select>

              <select
                value={r.manager_id ?? ""}
                disabled={!canAssignManager}
                onChange={(e) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, manager_id: e.target.value || null } : x)))}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", background: canAssignManager ? "#fff" : "#f6f6f6" }}
              >
                <option value="">—</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {(m.full_name || m.id).slice(0, 40)}
                  </option>
                ))}
              </select>

              <input
                type="number"
                step="0.01"
                min="0"
                value={Number(r.hourly_rate ?? 0)}
                disabled={!canEdit || r.role !== "contractor"}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((x) =>
                      x.id === r.id ? { ...x, hourly_rate: Number(e.target.value) } : x
                    )
                  )
                }
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: canEdit && r.role === "contractor" ? "#fff" : "#f6f6f6",
                }}
              />

              <select
                value={r.is_active === false ? "inactive" : "active"}
                disabled={!isAdmin}
                onChange={(e) =>
                  setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: e.target.value === "active" } : x)))
                }
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", background: isAdmin ? "#fff" : "#f6f6f6" }}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  disabled={!isAdmin && !isManager && !isSelf}
                  onClick={() => router.push(`/projects?user=${encodeURIComponent(r.id)}`)}
                >
                  Project access
                </button>

                <button
                  disabled={!canEdit || busyId === r.id}
                  onClick={() =>
                    saveRow(r.id, {
                      full_name: r.full_name || null,
                      role: r.role,
                      manager_id: r.manager_id,
                      hourly_rate: r.role === "contractor" ? Number(r.hourly_rate ?? 0) : null,
                      is_active: r.is_active !== false,
                    })
                  }
                  style={{ fontWeight: 900 }}
                >
                  {busyId === r.id ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

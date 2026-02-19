"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseBrowser";

type Role = "admin" | "manager" | "contractor";
type ManagerRow = { id: string; full_name: string | null; role: Role };

export default function AdminInvitePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role | null>(null);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [hourlyRate, setHourlyRate] = useState<number>(0);
  const [inviteRole, setInviteRole] = useState<Role>("contractor");

  // NEW
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [managerId, setManagerId] = useState<string>("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const canSend = useMemo(() => {
    if (!email.trim()) return false;
    if (!["manager", "contractor"].includes(inviteRole)) return false;
    if (inviteRole === "contractor") {
      if (Number.isNaN(hourlyRate) || hourlyRate < 0) return false;
    }
    return true;
  }, [email, inviteRole, hourlyRate]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!session?.user) {
        router.push("/login");
        return;
      }

      const { data: prof, error } = await supabase
        .from("profiles")
        .select("role, org_id")
        .eq("id", session.user.id)
        .maybeSingle();

      if (error) {
        setMsg(error.message);
        setRole(null);
        setLoading(false);
        return;
      }

      if (!prof?.role) {
        setMsg("Profile not found. (No role assigned)");
        setRole(null);
        setLoading(false);
        return;
      }

      setRole(prof.role as Role);

      // NEW: load managers list for assignment
      const { data: mgrs, error: mgrErr } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("org_id", prof.org_id)
        .in("role", ["admin", "manager"])
        .eq("is_active", true)
        .order("role", { ascending: true })
        .order("full_name", { ascending: true });

      if (!mgrErr) {
        const list = ((mgrs as any) ?? []) as ManagerRow[];
        setManagers(list);

        // Default manager pick: first manager (not admin) if present, else first
        const prefer = list.find((m) => m.role === "manager")?.id || list[0]?.id || "";
        setManagerId(prefer);
      }

      setLoading(false);
    })();
  }, [router]);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setBusy(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setMsg("Not logged in.");
        setBusy(false);
        return;
      }

      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email,
          full_name: fullName,
          hourly_rate: hourlyRate,
          role: inviteRole,
          manager_id: inviteRole === "contractor" ? (managerId || null) : null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setMsg(json?.error || `Invite failed (${res.status})`);
        setBusy(false);
        return;
      }

      setMsg("Invite sent ✅");
      setEmail("");
      setFullName("");
      setHourlyRate(0);
      setInviteRole("contractor");
      // keep manager selection
    } catch (err: any) {
      setMsg(err?.message || "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 820, margin: "40px auto", padding: 16 }}>
        <h1 style={{ fontSize: 34, fontWeight: 800 }}>Admin</h1>
        <p>Loading…</p>
      </main>
    );
  }

  if (role !== "admin") {
    return (
      <main style={{ maxWidth: 820, margin: "40px auto", padding: 16 }}>
        <h1 style={{ fontSize: 34, fontWeight: 800 }}>Admin</h1>
        <p style={{ color: "#b00", marginTop: 12 }}>Admin only</p>
        {msg ? (
          <div style={{ marginTop: 12, padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
            {msg}
          </div>
        ) : null}
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => router.push("/dashboard")} style={{ padding: "10px 14px" }}>
            Back to Dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 820, margin: "40px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 800, margin: 0 }}>Admin</h1>
          <p style={{ marginTop: 8, color: "#444" }}>
            Invite users + maintain your org setup.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => router.push("/profiles")}>Profiles</button>
          <button onClick={() => router.push("/projects")}>Projects</button>
          <button onClick={() => router.push("/dashboard")}>Dashboard</button>
        </div>
      </div>

      <form onSubmit={sendInvite} style={{ marginTop: 18, border: "1px solid #eee", borderRadius: 14, padding: 16 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>Invite User</div>
        <div style={{ opacity: 0.75, marginTop: 4 }}>
          Contractors must have a manager. Managers don’t need hourly rate.
        </div>

        <label style={{ display: "block", fontWeight: 700, marginTop: 14, marginBottom: 6 }}>Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
          style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
        />

        <label style={{ display: "block", fontWeight: 700, marginTop: 14, marginBottom: 6 }}>Full name</label>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Jane Contractor"
          style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
          <div>
            <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
            >
              <option value="contractor">contractor</option>
              <option value="manager">manager</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
              Hourly rate {inviteRole === "manager" ? "(n/a)" : ""}
            </label>
            <input
              value={Number.isNaN(hourlyRate) ? "" : hourlyRate}
              onChange={(e) => setHourlyRate(Number(e.target.value))}
              type="number"
              step="0.01"
              min="0"
              disabled={inviteRole === "manager"}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 10,
                border: "1px solid #ddd",
                background: inviteRole === "manager" ? "#f6f6f6" : "#fff",
              }}
            />
          </div>
        </div>

        {/* NEW: Manager assignment */}
        {inviteRole === "contractor" ? (
          <div style={{ marginTop: 14 }}>
            <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Assign Manager</label>
            <select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
            >
              <option value="">Select…</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {(m.full_name || m.id).slice(0, 60)} — {m.role}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 6, opacity: 0.7, fontSize: 13 }}>
              This drives Manager dashboard + approvals scoping.
            </div>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canSend || busy || (inviteRole === "contractor" && !managerId)}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #111",
            background: busy ? "#666" : "#111",
            color: "#fff",
            fontWeight: 800,
            cursor: !canSend || busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Sending…" : "Send Invite"}
        </button>

        {msg ? (
          <div style={{ marginTop: 12, padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
            {msg}
          </div>
        ) : null}
      </form>
    </main>
  );
}

// src/app/projects/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseBrowser";
import { useProfile } from "../../lib/useProfile";

type Role = "admin" | "manager" | "contractor";

type ProjectRow = {
  id: string;
  org_id: string;
  name: string;
  parent_id: string | null;
  is_active: boolean | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: Role;
  is_active: boolean | null;
  manager_id: string | null;
};

type MemberRow = {
  id: string;
  project_id: string;
  profile_id: string;
  is_active: boolean | null;
};

export default function ProjectsPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const focusUser = sp.get("user") || "";

  const { loading: profLoading, profile, userId } = useProfile();

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [orgProfiles, setOrgProfiles] = useState<ProfileRow[]>([]);
  const [membersByProject, setMembersByProject] = useState<Record<string, MemberRow[]>>({});

  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState("");

  const isAdminOrManager = profile?.role === "admin" || profile?.role === "manager";

  useEffect(() => {
    if (!profile?.org_id || !userId) return;

    let cancelled = false;
    (async () => {
      setMsg("");

      // Load org profiles (for member assignment UI)
      const { data: profs, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name, role, is_active, manager_id")
        .eq("org_id", profile.org_id)
        .eq("is_active", true)
        .order("role", { ascending: true })
        .order("full_name", { ascending: true });

      if (!cancelled) {
        if (profErr) setMsg(profErr.message);
        setOrgProfiles(((profs as any) ?? []) as ProfileRow[]);
      }

      // Load projects (admin/manager sees all, contractor sees membership only)
      if (isAdminOrManager) {
        const { data: projs, error } = await supabase
          .from("projects")
          .select("id, org_id, name, parent_id, is_active")
          .eq("org_id", profile.org_id)
          .order("name", { ascending: true });

        if (!cancelled) {
          if (error) setMsg((m) => (m ? `${m}\n${error.message}` : error.message));
          setProjects(((projs as any) ?? []) as ProjectRow[]);
        }
      } else {
        // Model B: membership drives project visibility
        // Requires FK relationship project_members.project_id → projects.id
        const { data: pm, error } = await supabase
          .from("project_members")
          .select("project_id, projects(id, org_id, name, parent_id, is_active)")
          .eq("profile_id", userId)
          .eq("is_active", true);

        if (!cancelled) {
          if (error) setMsg((m) => (m ? `${m}\n${error.message}` : error.message));
          const list = (((pm as any) ?? []) as any[])
            .map((x) => x.projects)
            .filter(Boolean) as ProjectRow[];
          setProjects(list.filter((p) => p.is_active !== false));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile?.org_id, userId, isAdminOrManager]);

  async function loadMembers(projectId: string) {
    setMsg("");

    const { data, error } = await supabase
      .from("project_members")
      .select("id, project_id, profile_id, is_active")
      .eq("project_id", projectId)
      .eq("is_active", true);

    if (error) {
      setMsg(error.message);
      return;
    }

    setMembersByProject((prev) => ({ ...prev, [projectId]: ((data as any) ?? []) as MemberRow[] }));
  }

  async function createProject() {
    if (!profile?.org_id) return;
    if (!isAdminOrManager) {
      setMsg("Only admin/manager can create projects.");
      return;
    }

    const name = newName.trim();
    if (!name) return;

    setBusy(true);
    setMsg("");

    const { data, error } = await supabase
      .from("projects")
      .insert({ org_id: profile.org_id, name, is_active: true })
      .select("id, org_id, name, parent_id, is_active")
      .single();

    setBusy(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setProjects((prev) => [...prev, data as any].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName("");
  }

  async function addMember(projectId: string, profileId: string) {
    setMsg("");
    if (!profileId) return;

    const { error } = await supabase.from("project_members").insert({
      org_id: profile?.org_id,
      project_id: projectId,
      profile_id: profileId,
      is_active: true,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    await loadMembers(projectId);
  }

  async function removeMember(projectId: string, memberId: string) {
    setMsg("");
    const { error } = await supabase.from("project_members").update({ is_active: false }).eq("id", memberId);
    if (error) {
      setMsg(error.message);
      return;
    }
    await loadMembers(projectId);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (profLoading) {
    return (
      <main style={{ maxWidth: 1100, margin: "24px auto", padding: 16 }}>
        <h1>Projects</h1>
        <p>Loading…</p>
      </main>
    );
  }

  if (!profile || !userId) {
    return (
      <main style={{ maxWidth: 1100, margin: "24px auto", padding: 16 }}>
        <h1>Projects</h1>
        <p>Please log in.</p>
        <button onClick={() => router.push("/login")}>Go to Login</button>
      </main>
    );
  }

  const focusProfileName = focusUser ? orgProfiles.find((p) => p.id === focusUser)?.full_name : "";

  return (
    <main style={{ maxWidth: 1100, margin: "24px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <div>
          <h1 style={{ margin: 0 }}>Projects</h1>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            {isAdminOrManager
              ? "Admin/Manager view (all projects)"
              : "Contractor view (membership only — Model B)"}
            {focusUser ? ` • Managing access for: ${focusProfileName || focusUser}` : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => router.push("/dashboard")}>Dashboard</button>
          <button onClick={() => router.push("/timesheet")}>Timesheet</button>
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

      {/* Create project (locked) */}
      <div style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 14, padding: 12 }}>
        <div style={{ fontWeight: 900 }}>Create Project</div>
        <div style={{ opacity: 0.75, marginTop: 4 }}>Locked to admin/manager only.</div>

        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g., KeHE — Program Mgmt"
            style={{ flex: "1 1 340px", padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
            disabled={!isAdminOrManager}
          />
          <button onClick={createProject} disabled={!isAdminOrManager || busy || !newName.trim()} style={{ fontWeight: 900 }}>
            {busy ? "Creating…" : "Create"}
          </button>
        </div>

        {!isAdminOrManager ? (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 12, background: "#fff7f7", border: "1px solid #ffd6d6" }}>
            Contractors cannot create projects. Ask your admin/manager.
          </div>
        ) : null}
      </div>

      {/* Project list + membership */}
      <div style={{ marginTop: 14 }}>
        {projects.length === 0 ? (
          <div style={{ opacity: 0.8 }}>No projects found.</div>
        ) : (
          projects.map((p) => {
            const members = membersByProject[p.id] || [];
            const canManageMembers = isAdminOrManager;

            const candidatePeople = orgProfiles
              .filter((x) => x.is_active !== false)
              .filter((x) => (focusUser ? x.id === focusUser : true))
              .filter((x) => !members.some((m) => m.profile_id === x.id));

            return (
              <section key={p.id} style={{ border: "1px solid #eee", borderRadius: 14, padding: 12, marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{p.name}</div>
                    <div style={{ marginTop: 4, opacity: 0.75 }}>
                      Project ID: {p.id} • Active: {p.is_active === false ? "no" : "yes"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button onClick={() => loadMembers(p.id)}>{membersByProject[p.id] ? "Refresh members" : "Load members"}</button>
                  </div>
                </div>

                {canManageMembers ? (
                  <div style={{ marginTop: 12, borderTop: "1px solid #f0f0f0", paddingTop: 12 }}>
                    <div style={{ fontWeight: 900 }}>Membership (Model B)</div>
                    <div style={{ opacity: 0.75, marginTop: 4 }}>
                      Only members should see/select this project on timesheets. (Enforce with RLS in Supabase.)
                    </div>

                    <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                      <select
                        onChange={(e) => {
                          const pid = e.target.value;
                          if (!pid) return;
                          e.currentTarget.value = "";
                          addMember(p.id, pid);
                        }}
                        style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd", minWidth: 320 }}
                      >
                        <option value="">+ Add member…</option>
                        {candidatePeople.map((u) => (
                          <option key={u.id} value={u.id}>
                            {(u.full_name || u.id).slice(0, 45)} — {u.role}
                          </option>
                        ))}
                      </select>

                      {focusUser ? (
                        <button onClick={() => router.push("/projects")}>Clear focus</button>
                      ) : null}
                    </div>

                    <div style={{ marginTop: 10 }}>
                      {members.length === 0 ? (
                        <div style={{ opacity: 0.8 }}>No members loaded yet (or none assigned).</div>
                      ) : (
                        members.map((m) => {
                          const u = orgProfiles.find((x) => x.id === m.profile_id);
                          return (
                            <div
                              key={m.id}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 10,
                                padding: "10px 0",
                                borderTop: "1px solid #f0f0f0",
                                alignItems: "center",
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 800 }}>{u?.full_name || m.profile_id}</div>
                                <div style={{ opacity: 0.75, marginTop: 2 }}>
                                  {u?.role || "—"} • {m.profile_id}
                                </div>
                              </div>
                              <button onClick={() => removeMember(p.id, m.id)} style={{ fontWeight: 800 }}>
                                Remove
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f0f0f0", opacity: 0.8 }}>
                    Contractors: membership is managed by admin/manager.
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}

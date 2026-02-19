// src/app/projects/projects-client.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseBrowser";
import { useProfile } from "../../lib/useProfile";

type Project = {
  id: string;
  name: string;
  is_active: boolean;
  org_id: string;
};

export default function ProjectsClient() {
  const router = useRouter();
  const searchParams = useSearchParams(); // ✅ now safely inside Suspense via page.tsx
  const { loading, userId, profile, error: profErr } = useProfile();

  const selectedProjectId = useMemo(() => {
    return searchParams.get("project") || "";
  }, [searchParams]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [fetchErr, setFetchErr] = useState<string>("");

  useEffect(() => {
    if (loading) return;

    if (!userId) {
      router.replace("/login");
      return;
    }

    // If user exists but profile failed, show error rather than looping
    if (!profile) {
      setFetchErr(profErr || "Profile could not be loaded.");
      return;
    }

    (async () => {
      setFetchErr("");

      // Admin/Manager: show org projects
      // Contractor: show projects via project_members join
      if (profile.role === "admin" || profile.role === "manager") {
        const { data, error } = await supabase
          .from("projects")
          .select("id, name, is_active, org_id")
          .eq("org_id", profile.org_id)
          .order("name", { ascending: true });

        if (error) {
          setFetchErr(error.message);
          return;
        }
        setProjects((data || []) as Project[]);
      } else {
        // contractor: membership-driven (Model B)
        const { data, error } = await supabase
          .from("project_members")
          .select("project_id, projects:project_id (id, name, is_active, org_id)")
          .eq("profile_id", profile.id)
          .eq("is_active", true);

        if (error) {
          setFetchErr(error.message);
          return;
        }

        const flattened =
          (data || [])
            .map((row: any) => row.projects)
            .filter(Boolean) as Project[];

        // remove dupes (just in case)
        const uniq = Array.from(new Map(flattened.map(p => [p.id, p])).values());
        uniq.sort((a, b) => a.name.localeCompare(b.name));

        setProjects(uniq);
      }
    })();
  }, [loading, userId, profile, profErr, router]);

  function setProjectInUrl(projectId: string) {
    const url = projectId ? `/projects?project=${encodeURIComponent(projectId)}` : "/projects";
    router.replace(url);
  }

  return (
    <main style={{ maxWidth: 1100, margin: "24px auto", padding: 16 }}>
      <h1 style={{ margin: 0 }}>Projects</h1>

      {loading && <p style={{ marginTop: 10 }}>Loading…</p>}

      {!loading && !userId && (
        <div style={{ marginTop: 12 }}>
          <p>Please log in.</p>
          <button onClick={() => router.push("/login")}>Go to Login</button>
        </div>
      )}

      {!loading && userId && !profile && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
          <div style={{ fontWeight: 800 }}>Logged in, but profile could not be loaded.</div>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{profErr || "No details."}</pre>
        </div>
      )}

      {!!fetchErr && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #f3c", borderRadius: 10 }}>
          <div style={{ fontWeight: 800 }}>Error</div>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{fetchErr}</pre>
        </div>
      )}

      {!!profile && (
        <div style={{ marginTop: 12, opacity: 0.85 }}>
          Role: <b>{profile.role}</b> &nbsp;|&nbsp; Org: <code>{profile.org_id}</code>
        </div>
      )}

      <section style={{ marginTop: 16 }}>
        <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
          Selected Project (via URL query param)
        </label>
        <select
          value={selectedProjectId}
          onChange={(e) => setProjectInUrl(e.target.value)}
          style={{ padding: 8, minWidth: 320 }}
        >
          <option value="">— Select a project —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.is_active ? "" : " (inactive)"}
            </option>
          ))}
        </select>
      </section>

      <section style={{ marginTop: 20 }}>
        <h3 style={{ marginBottom: 10 }}>Projects</h3>
        {projects.length === 0 ? (
          <p style={{ opacity: 0.8 }}>No projects found.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {projects.map((p) => (
              <li key={p.id}>
                <b>{p.name}</b> — <code>{p.id}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

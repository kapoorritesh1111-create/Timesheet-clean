// src/app/projects/page.tsx
import { Suspense } from "react";
import ProjectsClient from "./projects-client";

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading Projects…</div>}>
      <ProjectsClient />
    </Suspense>
  );
}

// src/app/api/admin/invite/route.ts
import { NextResponse } from "next/server";
// NOTE: This file lives at src/app/api/admin/invite/route.ts
// We need to go 4 levels up to reach src/lib/supabaseServer.ts
import { supabaseService } from "../../../../lib/supabaseServer";

type Role = "admin" | "manager" | "contractor";

/**
 * Admin invite endpoint
 * POST /api/admin/invite
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });

    const email = String(body.email || "").trim().toLowerCase();
    const full_name = String(body.full_name || "").trim();
    const hourly_rate = Number(body.hourly_rate ?? 0);
    const role = String(body.role || "contractor") as Role;
    const manager_id = body.manager_id ? String(body.manager_id) : null;

    if (!email) return NextResponse.json({ ok: false, error: "Email required" }, { status: 400 });
    if (!["manager", "contractor"].includes(role)) {
      return NextResponse.json({ ok: false, error: "Role must be manager or contractor" }, { status: 400 });
    }
    if (Number.isNaN(hourly_rate) || hourly_rate < 0) {
      return NextResponse.json({ ok: false, error: "Hourly rate invalid" }, { status: 400 });
    }

    const supa = supabaseService();

    // Verify caller token
    const { data: caller, error: callerErr } = await supa.auth.getUser(token);
    if (callerErr || !caller?.user) {
      return NextResponse.json({ ok: false, error: callerErr?.message || "Unauthorized" }, { status: 401 });
    }

    // Caller must be admin
    const { data: callerProf, error: callerProfErr } = await supa
      .from("profiles")
      .select("id, org_id, role")
      .eq("id", caller.user.id)
      .maybeSingle();

    if (callerProfErr) return NextResponse.json({ ok: false, error: callerProfErrErr(callerProfErr) }, { status: 400 });
    if (!callerProf?.org_id || callerProf.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
    }

    // Invite
    const redirectTo =
      `${process.env.NEXT_PUBLIC_SITE_URL || ""}/auth/callback`.trim() || undefined;

    const { data: inviteData, error: inviteErr } = await supa.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (inviteErr) return NextResponse.json({ ok: false, error: inviteErr.message }, { status: 400 });

    const invitedUserId = inviteData.user?.id;
    if (!invitedUserId) return NextResponse.json({ ok: false, error: "Invite created but missing user id" }, { status: 400 });

    // Upsert profile for invited user
    const payload = {
      id: invitedUserId,
      org_id: callerProf.org_id,
      role,
      full_name: full_name || null,
      hourly_rate: role === "contractor" ? hourly_rate : null,
      is_active: true,
      manager_id: role === "contractor" ? manager_id : null,
    };

    const { error: upErr } = await supa.from("profiles").upsert(payload, { onConflict: "id" });
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}

function callerProfErrErr(err: any) {
  return err?.message || "Profile lookup failed";
}

import { data } from "react-router";
import type { Route } from "./+types/api.dashboard-access";
import { issueDashboardAccess, ForgeError } from "../lib/blockyforge.server";
import { noStoreHeaders } from "../lib/http";
import { requireAdmin } from "../lib/session.server";

export function headers() {
	return noStoreHeaders();
}

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env;
	await requireAdmin(request, env.ADMIN_KEY);
	if (request.method !== "POST") {
		return data({ error: "Method not allowed" }, { status: 405, headers: noStoreHeaders() });
	}
	const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
	const email = typeof body?.email === "string" ? body.email.trim() : "";
	if (!email || email.length > 200 || !email.includes("@")) {
		return data({ error: "需要有效的邮箱。" }, { status: 400, headers: noStoreHeaders() });
	}
	try {
		const issued = await issueDashboardAccess(env, email);
		console.info(JSON.stringify({ event: "dashboard_access_requested", at: new Date().toISOString() }));
		return data(issued, { headers: noStoreHeaders() });
	} catch (error) {
		if (error instanceof ForgeError) {
			return data({ error: error.message }, { status: error.status, headers: noStoreHeaders() });
		}
		throw error;
	}
}

export function loader() {
	throw new Response("Not found", { status: 404, headers: noStoreHeaders() });
}

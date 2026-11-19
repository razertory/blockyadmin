import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { noStoreHeaders } from "../lib/http";
import { clearSessionCookie } from "../lib/session.server";

export function headers() {
	return noStoreHeaders();
}

export async function action({ request }: Route.ActionArgs) {
	if (request.method !== "POST") throw new Response("Method not allowed", { status: 405, headers: noStoreHeaders() });
	return redirect("/login", { headers: { "Set-Cookie": clearSessionCookie(request), ...noStoreHeaders() } });
}

export async function loader() {
	throw redirect("/login");
}

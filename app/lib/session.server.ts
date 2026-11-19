import { redirect } from "react-router";

const COOKIE = "ba_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

export async function requireAdmin(request: Request, password: string | undefined): Promise<void> {
	if (!password || !(await readSession(request, password))) {
		throw redirect("/login", { headers: { "Cache-Control": "no-store" } });
	}
}

export async function hasSession(request: Request, password: string | undefined): Promise<boolean> {
	if (!password) return false;
	return readSession(request, password);
}

export async function passwordsMatch(left: string, right: string): Promise<boolean> {
	if (!left || !right || left.length > 1024 || right.length > 1024) return false;
	const digest = async (value: string) =>
		new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
	const [a, b] = await Promise.all([digest(left), digest(right)]);
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
	return diff === 0;
}

export async function sessionCookie(request: Request, password: string): Promise<string> {
	const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
	const signature = await sign(password, `v1.${exp}`);
	return serializeCookie(request, `${exp}.${signature}`, MAX_AGE_SECONDS);
}

export function clearSessionCookie(request: Request): string {
	return serializeCookie(request, "", 0);
}

async function readSession(request: Request, password: string): Promise<boolean> {
	const raw = readCookie(request, COOKIE);
	if (!raw) return false;
	const dot = raw.indexOf(".");
	if (dot <= 0) return false;
	const exp = Number(raw.slice(0, dot));
	const signature = raw.slice(dot + 1);
	const now = Math.floor(Date.now() / 1000);
	if (!Number.isSafeInteger(exp) || exp <= now || exp > now + MAX_AGE_SECONDS) return false;
	const expected = await sign(password, `v1.${exp}`);
	return safeEqual(signature, expected);
}

async function sign(secret: string, payload: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
	return base64Url(bytes);
}

function safeEqual(left: string, right: string): boolean {
	const a = new TextEncoder().encode(left);
	const b = new TextEncoder().encode(right);
	let diff = a.length ^ b.length;
	const length = Math.max(a.length, b.length);
	for (let i = 0; i < length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
	return diff === 0;
}

function serializeCookie(request: Request, value: string, maxAge: number): string {
	const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
	return `${COOKIE}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

function readCookie(request: Request, name: string): string | null {
	const header = request.headers.get("Cookie");
	if (!header) return null;
	for (const part of header.split(";")) {
		const separator = part.indexOf("=");
		if (separator < 0) continue;
		if (part.slice(0, separator).trim() !== name) continue;
		try {
			return decodeURIComponent(part.slice(separator + 1).trim());
		} catch {
			return null;
		}
	}
	return null;
}

function base64Url(bytes: ArrayBuffer): string {
	const text = btoa(String.fromCharCode(...new Uint8Array(bytes)));
	return text.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

import { nullableNumber, nullableText, text } from "./format";

export class ForgeError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "ForgeError";
	}
}

export type AdminUser = {
	id: string;
	name: string;
	email: string;
	createdAt: string;
	stripeCustomerId: string | null;
	subscriptionStatus: string | null;
	assetCount: number;
	currentCredits: number;
	creditLimit: number;
	plan: string;
	planSource: "manual" | "stripe" | null;
};

export type UserProfile = {
	id: string;
	name: string;
	email: string;
	avatarUrl: string | null;
	stripeCustomerId: string | null;
	createdAt: string;
	updatedAt: string;
	emailVerifiedAt: string | null;
	googleLinked: boolean;
};

export type AssetRow = {
	id: string;
	name: string;
	status: string;
	prompt: string;
	cubeCount: number | null;
	boneCount: number | null;
	errorMessage: string | null;
	createdAt: string;
	updatedAt: string;
	hasThumbnail: boolean;
};

type QueryResult = { data: Record<string, unknown>[]; count: number };

const TABLES = new Set([
	"users",
	"assets",
	"subscriptions",
	"plan_grants",
	"credit_grants",
	"models",
	"model_previews",
	"game_configs",
]);

export type BillingFilter = "subscribed" | "checked_out" | "unsubscribed" | "checkout_unpaid";

export type BillingSummary = {
	total: number;
	subscribed: number;
	checkedOutUnsubscribed: number;
};

export function matchesBilling(user: AdminUser, filter: BillingFilter) {
	if (filter === "subscribed") return Boolean(user.subscriptionStatus);
	if (filter === "checked_out") return Boolean(user.stripeCustomerId);
	if (filter === "checkout_unpaid") return Boolean(user.stripeCustomerId) && !user.subscriptionStatus;
	return !user.subscriptionStatus;
}

export async function billingSummary(env: Env): Promise<BillingSummary> {
	const total = (await queryTable(env, "users", { select: "id", limit: 1 })).count;
	const subscribed = new Set<string>();
	await eachPage(env, "subscriptions", { select: "user_id", order: "user_id.asc" }, (row) => {
		const id = text(row.user_id);
		if (id) subscribed.add(id);
	});
	let checkedOutUnsubscribed = 0;
	await eachPage(env, "users", { select: "id,stripe_customer_id", stripe_customer_id: "like.*", order: "id.asc" }, (row) => {
		const id = text(row.id);
		if (id && nullableText(row.stripe_customer_id) && !subscribed.has(id)) checkedOutUnsubscribed += 1;
	});
	return { total, subscribed: subscribed.size, checkedOutUnsubscribed };
}

async function eachPage(env: Env, table: string, params: Record<string, string>, visit: (row: Record<string, unknown>) => void) {
	for (let offset = 0; offset <= 1_000_000; offset += 100) {
		const page = await queryTable(env, table, { ...params, limit: 100, offset });
		for (const row of page.data) visit(row);
		if (page.data.length < 100) break;
	}
}

export async function listFilteredUsers(env: Env, search: string, filter: BillingFilter) {
	const users: AdminUser[] = [];
	const seen = new Set<string>();
	for (let offset = 0; offset <= 1_000_000; offset += 20) {
		const page = await listUsers(env, search, offset);
		for (const user of page.users) {
			if (seen.has(user.id) || !matchesBilling(user, filter)) continue;
			seen.add(user.id);
			users.push(user);
		}
		if (!page.hasMore) break;
	}
	return users;
}

export async function listUsers(env: Env, search: string, offset: number) {
	const body = await forgeJson(env, "/admin/api/users", {
		search: search.slice(0, 200),
		offset,
	});
	const users = Array.isArray(body.users) ? body.users.flatMap(parseUser) : [];
	const seen = new Set<string>();
	return {
		users: users.filter((user) => {
			if (seen.has(user.id)) return false;
			seen.add(user.id);
			return true;
		}),
		hasMore: body.hasMore === true,
	};
}

export async function findBilling(env: Env, email: string, id: string): Promise<AdminUser | null> {
	for (let offset = 0; offset < 100; offset += 20) {
		const page = await listUsers(env, email, offset);
		const hit = page.users.find((user) => user.id === id);
		if (hit) return hit;
		if (!page.hasMore) break;
	}
	return null;
}

export async function userProfile(env: Env, id: string): Promise<UserProfile | null> {
	const result = await queryTable(env, "users", {
		select: "id,name,email,avatar_url,google_id,stripe_customer_id,created_at,updated_at,email_verified_at",
		id: `eq.${id}`,
		limit: 1,
	});
	const row = result.data[0];
	if (!row || text(row.id) !== id) return null;
	const avatar = nullableText(row.avatar_url);
	return {
		id,
		name: text(row.name),
		email: text(row.email),
		avatarUrl: avatar && /^https:\/\//.test(avatar) ? avatar : null,
		stripeCustomerId: nullableText(row.stripe_customer_id),
		createdAt: text(row.created_at),
		updatedAt: text(row.updated_at),
		emailVerifiedAt: nullableText(row.email_verified_at),
		googleLinked: Boolean(nullableText(row.google_id)),
	};
}

export type LatestModel = {
	assetId: string;
	assetName: string;
	userId: string;
	email: string;
	gamingId: string;
	createdAt: string;
	hasThumbnail: boolean;
};

export async function latestModels(env: Env, offset: number) {
	const seen = new Set<string>();
	const models: { assetId: string; modelId: string; createdAt: string }[] = [];
	await eachPage(env, "models", { select: "id,asset_id,created_at", order: "created_at.desc,id.desc" }, (row) => {
		const assetId = text(row.asset_id);
		const modelId = text(row.id);
		if (assetId && modelId && !seen.has(assetId)) {
			seen.add(assetId);
			models.push({ assetId, modelId, createdAt: text(row.created_at) });
		}
	});
	const assets = new Map<string, Record<string, unknown>>();
	await eachPage(env, "assets", { select: "id,user_id,name,thumbnail_storage_key,meta", order: "id.asc" }, (row) => {
		if (isVisibleAsset(row.meta)) assets.set(text(row.id), row);
	});
	const visible = models.filter((model) => assets.has(model.assetId));
	const page = visible.slice(offset, offset + 20);
	const rows = await Promise.all(page.map(async (model): Promise<LatestModel | null> => {
		const asset = assets.get(model.assetId)!;
		const userId = text(asset.user_id);
		const [users, configs, main] = await Promise.all([
			queryTable(env, "users", { select: "id,email", id: `eq.${userId}`, limit: 1 }),
			queryTable(env, "game_configs", { select: "gaming_id", asset_id: `eq.${model.assetId}`, limit: 100 }),
			modelPreviewMain(env, model.modelId),
		]);
		const user = users.data[0];
		if (!user) return null;
		const ids = configs.data.map((row) => text(row.gaming_id)).filter((id) => id && id !== "java.entity.mythicmobs");
		return {
			assetId: model.assetId,
			assetName: text(asset.name) || "未命名",
			userId,
			email: text(user.email),
			gamingId: ids.length === 1 ? ids[0] : "modeling.generic",
			createdAt: model.createdAt,
			hasThumbnail: Boolean(main || nullableText(asset.thumbnail_storage_key)),
		};
	}));
	return { models: rows.filter((row): row is LatestModel => row !== null), total: visible.length };
}

export async function visibleAssetCounts(env: Env, userIds: string[]) {
	const pairs = await Promise.all(userIds.map(async (userId) => [userId, await countVisibleAssets(env, userId)] as const));
	return new Map(pairs);
}

export async function userAssets(env: Env, userId: string, offset: number) {
	const rows = await assetPages(env, userId, "id,name,status,prompt,cube_count,bone_count,error_message,created_at,updated_at,thumbnail_storage_key,meta", "updated_at.desc,id.desc");
	const visible = rows.flatMap((row) => (isVisibleAsset(row.meta) ? toAssetRow(row) : []));
	const page = visible.slice(offset, offset + 20);
	const assets = await Promise.all(page.map(async (asset) => ({
		...asset,
		hasThumbnail: Boolean(await latestModelPreview(env, asset.id) || asset.hasThumbnail),
	})));
	return {
		assets,
		count: visible.length,
		internalCount: rows.length - visible.length,
		offset,
	};
}

async function latestModelPreview(env: Env, assetId: string) {
	const found = await queryTable(env, "models", {
		select: "id",
		asset_id: `eq.${assetId}`,
		order: "created_at.desc,id.desc",
		limit: 1,
	});
	const modelId = text(found.data[0]?.id);
	return modelId ? modelPreviewMain(env, modelId) : null;
}

async function modelPreviewMain(env: Env, modelId: string) {
	const previews = await queryTable(env, "model_previews", {
		select: "images",
		model_id: `eq.${modelId}`,
		limit: 1,
	});
	return previewMain(previews.data[0]?.images);
}

function previewMain(value: unknown): string | null {
	if (typeof value === "string") {
		try {
			return previewMain(JSON.parse(value) as unknown);
		} catch {
			return null;
		}
	}
	if (!isRecord(value)) return null;
	const main = value.main;
	return typeof main === "string" && main.length > 0 ? main : null;
}

async function countVisibleAssets(env: Env, userId: string) {
	const rows = await assetPages(env, userId, "id,meta", "id.asc");
	return rows.filter((row) => isVisibleAsset(row.meta)).length;
}

async function assetPages(env: Env, userId: string, select: string, order: string) {
	const rows: Record<string, unknown>[] = [];
	for (let offset = 0; offset <= 1_000_000; offset += 100) {
		const result = await queryTable(env, "assets", {
			select,
			user_id: `eq.${userId}`,
			order,
			limit: 100,
			offset,
		});
		rows.push(...result.data);
		if (result.data.length < 100) break;
	}
	return rows;
}

function toAssetRow(row: Record<string, unknown>): AssetRow[] {
	const id = text(row.id);
	if (!id) return [];
	return [{
		id,
		name: text(row.name) || "未命名",
		status: text(row.status) || "unknown",
		prompt: text(row.prompt),
		cubeCount: nullableNumber(row.cube_count),
		boneCount: nullableNumber(row.bone_count),
		errorMessage: nullableText(row.error_message),
		createdAt: text(row.created_at),
		updatedAt: text(row.updated_at),
		hasThumbnail: Boolean(nullableText(row.thumbnail_storage_key)),
	}];
}

function isVisibleAsset(meta: unknown) {
	if (typeof meta !== "string" || meta.length === 0) return true;
	try {
		const parsed: unknown = JSON.parse(meta);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return true;
		const record = parsed as Record<string, unknown>;
		return record.internalTask !== true && record.targetAssetId === undefined;
	} catch {
		return true;
	}
}

export async function userRows(env: Env, table: "subscriptions" | "plan_grants" | "credit_grants", userId: string, order: string) {
	const result = await queryTable(env, table, {
		select: selectFor(table),
		user_id: `eq.${userId}`,
		order,
		limit: 20,
	});
	return result.data;
}

export async function issueDashboardAccess(env: Env, email: string) {
	const base = forgeBase(env);
	const response = await forge(env, "/api/admin/dashboard-access", {
		method: "POST",
		json: { email },
	});
	const body = await readBody(response);
	if (!response.ok) throw new ForgeError(response.status, safeMessage(response.status, body));
	const url = typeof body.url === "string" ? body.url : "";
	const expiresIn = typeof body.expiresIn === "number" ? body.expiresIn : 60;
	if (!isAccessUrl(url, base)) throw new ForgeError(502, "登录链接无效。");
	return { url, expiresIn };
}

export async function assetThumbnail(env: Env, assetId: string) {
	return forge(env, `/admin/api/assets/${assetId}/thumbnail`);
}

async function queryTable(env: Env, table: string, params: Record<string, string | number>): Promise<QueryResult> {
	if (!TABLES.has(table)) throw new ForgeError(400, "不支持查询这张表。");
	const body = await forgeJson(env, `/admin/api/db/tables/${table}`, params);
	const count = typeof body.count === "number" ? body.count : 0;
	const data = Array.isArray(body.data) ? body.data.filter(isRecord) : [];
	return { data, count };
}

function selectFor(table: "subscriptions" | "plan_grants" | "credit_grants"): string {
	if (table === "subscriptions") {
		return "id,status,stripe_price_id,current_period_start,current_period_end,cancel_at_period_end,cancel_at,created_at,updated_at";
	}
	if (table === "plan_grants") {
		return "id,plan,starts_at,ends_at,credits_per_period,reason,created_at,revoked_at,revoke_reason";
	}
	return "id,amount,source,reason,created_at,revoked_at,revoke_reason";
}

async function forgeJson(env: Env, path: string, params: Record<string, string | number>) {
	const response = await forge(env, path, { params });
	const body = await readBody(response);
	if (!response.ok) throw new ForgeError(response.status, safeMessage(response.status, body));
	return body;
}

async function forge(env: Env, path: string, init: { method?: string; params?: Record<string, string | number>; json?: unknown } = {}) {
	const url = new URL(path, forgeBase(env));
	for (const [key, value] of Object.entries(init.params ?? {})) url.searchParams.set(key, String(value));
	const headers = new Headers({
		Accept: init.json === undefined ? "*/*" : "application/json",
		Authorization: `Bearer ${env.ADMIN_KEY}`,
	});
	if (init.json !== undefined) headers.set("Content-Type", "application/json");
	try {
		return await fetch(url, {
			method: init.method ?? "GET",
			headers,
			body: init.json === undefined ? undefined : JSON.stringify(init.json),
			cache: "no-store",
			redirect: "manual",
			signal: AbortSignal.timeout(20_000),
		});
	} catch {
		throw new ForgeError(504, "连接 BlockyForge 超时或失败。");
	}
}

function forgeBase(env: Env): string {
	const base = env.BLOCKYFORGE_URL?.replace(/\/$/, "");
	if (!base || !env.ADMIN_KEY) throw new ForgeError(503, "未配置 BLOCKYFORGE_URL 或 ADMIN_KEY。");
	return base;
}

async function readBody(response: Response): Promise<Record<string, unknown>> {
	if (response.status >= 300 && response.status < 400) {
		throw new ForgeError(502, "BlockyForge 返回了意外的重定向。");
	}
	const type = response.headers.get("content-type") ?? "";
	const textBody = await response.text();
	if (!type.includes("json")) {
		if (!response.ok) {
			const missing = response.status === 404 ? "BlockyForge 没有这个接口。" : `BlockyForge 返回 ${response.status}。`;
			throw new ForgeError(response.status, missing);
		}
		return {};
	}
	if (!textBody) return {};
	try {
		const parsed: unknown = JSON.parse(textBody);
		return isRecord(parsed) ? parsed : {};
	} catch {
		throw new ForgeError(response.status || 502, "BlockyForge 返回了无法解析的响应。");
	}
}

function safeMessage(status: number, body: Record<string, unknown>): string {
	const raw = typeof body.error === "string" ? body.error : "";
	if (raw && raw.length < 180 && !/bearer|admin_key|token=/i.test(raw)) return raw;
	if (status === 401) return "管理员密钥被拒绝。";
	if (status === 404) return "没有找到记录。";
	if (status === 429) return "请求过于频繁，请稍后再试。";
	if (status === 503) return "BlockyForge 尚未配置管理员密钥。";
	return `BlockyForge 返回 ${status}。`;
}

function isAccessUrl(value: string, base: string): boolean {
	try {
		const url = new URL(value);
		const origin = new URL(base);
		return url.origin === origin.origin && url.pathname === "/auth/admin-access" && url.searchParams.has("token");
	} catch {
		return false;
	}
}

function parseUser(value: unknown): AdminUser[] {
	if (!isRecord(value) || !text(value.id) || !text(value.email)) return [];
	const source = value.planSource;
	return [{
		id: text(value.id),
		name: text(value.name),
		email: text(value.email),
		createdAt: text(value.createdAt),
		stripeCustomerId: nullableText(value.stripeCustomerId),
		subscriptionStatus: nullableText(value.subscriptionStatus),
		assetCount: nullableNumber(value.assetCount) ?? 0,
		currentCredits: nullableNumber(value.currentCredits) ?? 0,
		creditLimit: nullableNumber(value.creditLimit) ?? 0,
		plan: text(value.plan) || "Free",
		planSource: source === "manual" || source === "stripe" ? source : null,
	}];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

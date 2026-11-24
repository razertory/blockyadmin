import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/users.$id";
import { CopyButton } from "../components/copy-button";
import { OpenDashboard } from "../components/open-dashboard";
import { PayTags } from "../components/pay-tags";
import { Shell, Time } from "../components/shell";
import {
	findBilling,
	ForgeError,
	userAssets,
	userProfile,
	userPurchasedCredits,
	userRows,
	type AssetRow,
} from "../lib/blockyforge.server";
import { nullableNumber, planSourceLabel, statusTone, text } from "../lib/format";
import { noStoreHeaders, pageOffset, UUID } from "../lib/http";
import { requireAdmin } from "../lib/session.server";
import { userCountryNames } from "../lib/umami.server";

export function meta({ data }: Route.MetaArgs) {
	const name = data && "profile" in data && data.profile ? data.profile.name : "用户";
	return [{ title: `${name} · BlockyForge 管理` }, { name: "robots", content: "noindex, nofollow" }];
}

export function headers() {
	return noStoreHeaders();
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	await requireAdmin(request, env.ADMIN_KEY);
	if (!UUID.test(params.id)) throw new Response("用户不存在", { status: 404, headers: noStoreHeaders() });
	const offset = pageOffset(new URL(request.url).searchParams.get("offset"));
	let profile;
	try {
		profile = await userProfile(env, params.id);
	} catch (error) {
		if (error instanceof ForgeError) {
			return emptyUser(offset, error.message);
		}
		throw error;
	}
	if (!profile) throw new Response("用户不存在", { status: 404, headers: noStoreHeaders() });
	const [billing, assets, subscriptions, planGrants, creditGrants, purchasedCredits, countries] = await Promise.all([
		loadSection(findBilling(env, profile.email, profile.id)),
		loadSection(userAssets(env, profile.id, offset)),
		loadSection(userRows(env, "subscriptions", profile.id, "created_at.desc")),
		loadSection(userRows(env, "plan_grants", profile.id, "created_at.desc")),
		loadSection(userRows(env, "credit_grants", profile.id, "created_at.desc")),
		loadSection(userPurchasedCredits(env, profile.id)),
		userCountryNames([profile.id]),
	]);
	const error = [billing, assets, subscriptions, planGrants, creditGrants, purchasedCredits]
		.flatMap((section) => (section.ok ? [] : [section.error]))
		.filter((message, index, all) => all.indexOf(message) === index)
		.join(" ");
	return {
		profile,
		billing: billing.ok ? billing.value : null,
		assets: assets.ok ? assets.value : { assets: [] as AssetRow[], count: 0, internalCount: 0, offset },
		subscriptions: subscriptions.ok ? subscriptions.value : [],
		planGrants: planGrants.ok ? planGrants.value : [],
		creditGrants: creditGrants.ok ? creditGrants.value : [],
		purchasedCredits: purchasedCredits.ok ? purchasedCredits.value : false,
		country: countries.get(profile.id) ?? null,
		error: error || null,
	};
}

async function loadSection<T>(work: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
	try {
		return { ok: true, value: await work };
	} catch (error) {
		if (error instanceof ForgeError) return { ok: false, error: error.message };
		throw error;
	}
}

function emptyUser(offset: number, error: string) {
	return {
		profile: null,
		billing: null,
		assets: { assets: [] as AssetRow[], count: 0, internalCount: 0, offset },
		subscriptions: [] as Record<string, unknown>[],
		planGrants: [] as Record<string, unknown>[],
		creditGrants: [] as Record<string, unknown>[],
		purchasedCredits: false,
		country: null,
		error,
	};
}

export default function UserDetail({ loaderData, params }: Route.ComponentProps) {
	const { profile, billing, assets, subscriptions, planGrants, creditGrants, purchasedCredits, country, error } = loaderData;
	if (!profile) {
		return (
			<Shell>
				<p className="text-sm text-bad">{error ?? "用户不存在"}</p>
				<Link to="/" className="mt-3 inline-block text-sm text-accent" prefetch="none">返回列表</Link>
			</Shell>
		);
	}
	return (
		<Shell>
			<Link to="/" className="text-sm text-stone-500 hover:text-ink" prefetch="none">返回列表</Link>
			<section className="mt-3 flex flex-wrap items-start justify-between gap-4">
				<div className="flex items-center gap-3">
					{profile.avatarUrl ? (
						<img src={profile.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
					) : (
						<div className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-200 text-sm">{profile.name.slice(0, 1) || "?"}</div>
					)}
					<div>
						<div className="flex flex-wrap items-center gap-2">
							<h1 className="text-xl font-semibold">{profile.name || "未命名"}</h1>
							<PayTags subscribed={Boolean(billing?.subscriptionStatus)} credits={purchasedCredits} />
						</div>
						<p className="text-sm text-stone-600">{profile.email}</p>
					</div>
				</div>
				<OpenDashboard email={profile.email} />
			</section>
			{error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-bad">{error}</p> : null}
			<section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Fact label="用户 ID" value={profile.id} copy />
				<Fact label="套餐" value={billing ? `${billing.plan} · ${planSourceLabel(billing.planSource)}` : "额度接口未返回"} />
				<Fact label="剩余额度" value={billing ? `${billing.currentCredits} / ${billing.creditLimit}` : "—"} />
				<Fact label="订阅状态" value={billing?.subscriptionStatus ?? "无订阅"} />
			</section>
			<section className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Fact label="Stripe Customer" value={profile.stripeCustomerId ?? "—"} copy={Boolean(profile.stripeCustomerId)} />
				<Fact label="邮箱验证" value={profile.emailVerifiedAt ? "已验证" : "未验证"} />
				<Fact label="Google" value={profile.googleLinked ? "已绑定" : "未绑定"} />
				<Fact label="注册时间" value={<Time value={profile.createdAt} />} />
				<Fact label="国家" value={country ?? "—"} />
			</section>

			<Panel title="订阅">
				{subscriptions.length === 0 ? <Empty>没有订阅记录</Empty> : (
					<ul className="divide-y divide-line">
						{subscriptions.map((row) => (
							<li key={text(row.id)} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
								<span className={`rounded px-1.5 py-0.5 text-xs ${statusTone(text(row.status))}`}>{text(row.status) || "unknown"}</span>
								<span className="text-stone-600">{text(row.stripe_price_id) || "无价格"}</span>
								<span>周期 <Time value={row.current_period_start} /> – <Time value={row.current_period_end} /></span>
								<span className="text-stone-500">{row.cancel_at_period_end ? "期末取消" : "持续"}</span>
							</li>
						))}
					</ul>
				)}
			</Panel>
			<div className="mt-4 grid gap-4 lg:grid-cols-2">
				<Panel title="套餐授予">
					<GrantList rows={planGrants} empty="没有套餐授予" render={(row) => (
						<>
							<span className="font-medium">{text(row.plan)}</span>
							<span className="text-stone-600">{nullableNumber(row.credits_per_period) ?? "—"} 额度/期</span>
							<span><Time value={row.starts_at} /> – <Time value={row.ends_at} /></span>
							{row.revoked_at ? <span className="text-bad">已撤销</span> : null}
							<span className="basis-full text-stone-500">{text(row.reason)}</span>
						</>
					)} />
				</Panel>
				<Panel title="额度授予">
					<GrantList rows={creditGrants} empty="没有额度授予" render={(row) => (
						<>
							<span className="font-medium">{nullableNumber(row.amount) ?? "—"} 额度</span>
							<span className="text-stone-600">{text(row.source)}</span>
							<Time value={row.created_at} />
							{row.revoked_at ? <span className="text-bad">已撤销</span> : null}
							<span className="basis-full text-stone-500">{text(row.reason)}</span>
						</>
					)} />
				</Panel>
			</div>
			<Assets assets={assets.assets} count={assets.count} internalCount={assets.internalCount} offset={assets.offset} paramsId={params.id} />
		</Shell>
	);
}

function Assets({ assets, count, internalCount = 0, offset, paramsId }: { assets: AssetRow[]; count: number; internalCount?: number; offset: number; paramsId: string }) {
	return (
		<section className="mt-6">
			<div className="mb-2 flex items-baseline justify-between">
				<h2 className="text-sm font-semibold">素材</h2>
				<p className="text-xs text-stone-500">
					共 {count} 个{internalCount > 0 ? `，另有 ${internalCount} 个内部任务未计入` : ""}
				</p>
			</div>
			{assets.length === 0 ? (
				<p className="rounded-xl border border-line bg-card px-3 py-6 text-center text-sm text-stone-500">没有素材</p>
			) : (
				<ul className="grid gap-3 sm:grid-cols-2">
					{assets.map((asset) => (
						<li key={asset.id} className="flex gap-3 rounded-xl border border-line bg-card p-3">
							{asset.hasThumbnail ? (
								<img src={`/thumbnails/${asset.id}`} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover bg-stone-200" />
							) : (
								<div className="h-16 w-16 shrink-0 rounded-md bg-stone-200" />
							)}
							<div className="min-w-0">
								<div className="flex items-center gap-2">
									<p className="truncate font-medium">{asset.name}</p>
									<span className={`rounded px-1.5 py-0.5 text-xs ${statusTone(asset.status)}`}>{asset.status}</span>
								</div>
								<p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-600">{asset.prompt || "无提示词"}</p>
								<p className="mt-1 text-xs text-stone-400">
									{asset.cubeCount ?? "—"} 方块 · {asset.boneCount ?? "—"} 骨骼 · <Time value={asset.updatedAt} />
								</p>
								{asset.errorMessage ? <p className="mt-1 text-xs text-bad">{asset.errorMessage}</p> : null}
							</div>
						</li>
					))}
				</ul>
			)}
			<div className="mt-3 flex justify-end gap-2 text-sm">
				{offset > 0 ? <Link to={assetHref(paramsId, offset - 20)} className="rounded-md border border-line bg-card px-3 py-1.5" prefetch="none">上一页</Link> : null}
				{offset + assets.length < count ? <Link to={assetHref(paramsId, offset + 20)} className="rounded-md border border-line bg-card px-3 py-1.5" prefetch="none">下一页</Link> : null}
			</div>
		</section>
	);
}

function GrantList({ rows, empty, render }: { rows: Record<string, unknown>[]; empty: string; render: (row: Record<string, unknown>) => ReactNode }) {
	if (rows.length === 0) return <Empty>{empty}</Empty>;
	return (
		<ul className="divide-y divide-line">
			{rows.map((row) => (
				<li key={text(row.id)} className="flex flex-wrap gap-x-3 gap-y-1 py-2 text-sm">{render(row)}</li>
			))}
		</ul>
	);
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="rounded-xl border border-line bg-card px-3 py-2">
			<h2 className="text-sm font-semibold">{title}</h2>
			<div className="mt-1">{children}</div>
		</section>
	);
}

function Empty({ children }: { children: ReactNode }) {
	return <p className="py-3 text-sm text-stone-500">{children}</p>;
}

function Fact({ label, value, copy = false }: { label: string; value: ReactNode; copy?: boolean }) {
	const textValue = typeof value === "string" ? value : null;
	return (
		<div className="rounded-xl border border-line bg-card px-3 py-2">
			<p className="text-xs text-stone-500">{label}</p>
			<div className="mt-1 flex items-start justify-between gap-2 break-all text-sm">
				<div>{value}</div>
				{copy && textValue && textValue !== "—" ? <CopyButton value={textValue} /> : null}
			</div>
		</div>
	);
}

function assetHref(id: string, offset: number) {
	return offset > 0 ? `/users/${id}?offset=${offset}` : `/users/${id}`;
}

import { Form, Link } from "react-router";
import type { Route } from "./+types/home";
import { CopyButton } from "../components/copy-button";
import { OpenDashboard } from "../components/open-dashboard";
import { PayTags } from "../components/pay-tags";
import { Shell, Time } from "../components/shell";
import { billingSummary, creditPurchaserIds, ForgeError, listFilteredUsers, listUsers, visibleAssetCounts, type AdminUser, type BillingFilter, type BillingSummary } from "../lib/blockyforge.server";
import { planSourceLabel, statusTone } from "../lib/format";
import { noStoreHeaders, pageOffset } from "../lib/http";
import { requireAdmin } from "../lib/session.server";
import { userCountryNames } from "../lib/umami.server";

export function meta({}: Route.MetaArgs) {
	return [{ title: "用户 · BlockyForge 管理" }, { name: "robots", content: "noindex, nofollow" }];
}

export function headers() {
	return noStoreHeaders();
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	await requireAdmin(request, env.ADMIN_KEY);
	const url = new URL(request.url);
	const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
	const offset = pageOffset(url.searchParams.get("offset"));
	const billing = billingFilter(url.searchParams.get("billing"));
	try {
		const purchasers = await creditPurchaserIds(env);
		const [page, summary] = await Promise.all([
			billing
				? filteredPage(env, q, billing, offset, purchasers)
				: listUsers(env, q, offset).then((result) => ({ users: result.users, hasMore: result.hasMore, total: null })),
			billingSummary(env, purchasers),
		]);
		const [counts, countries] = await Promise.all([
			visibleAssetCounts(env, page.users.map((user) => user.id)),
			userCountryNames(page.users.map((user) => user.id)),
		]);
		const users = page.users.map((user) => ({
			...user,
			assetCount: counts.get(user.id) ?? 0,
			country: countries.get(user.id) ?? null,
			purchasedCredits: purchasers.has(user.id),
		}));
		return { q, offset, billing, users, hasMore: page.hasMore, total: page.total, summary, error: null };
	} catch (error) {
		if (error instanceof ForgeError) {
			return { q, offset, billing, users: [] as ListedUser[], hasMore: false, total: null, summary: null, error: error.message };
		}
		throw error;
	}
}

type ListedUser = AdminUser & { country: string | null; purchasedCredits: boolean };

async function filteredPage(env: Env, search: string, billing: BillingFilter, offset: number, purchasers: ReadonlySet<string>) {
	const matched = await listFilteredUsers(env, search, billing, purchasers);
	return { users: matched.slice(offset, offset + 20), hasMore: offset + 20 < matched.length, total: matched.length };
}

export default function Home({ loaderData }: Route.ComponentProps) {
	const { q, offset, billing, users, hasMore, total, summary, error } = loaderData;
	return (
		<Shell>
			{summary ? <Summary summary={summary} billing={billing} /> : null}
			<Form method="get" className="mt-4 flex flex-wrap items-end gap-2">
				<label className="min-w-0 flex-1 basis-48 text-sm">
					<span className="mb-1 block text-stone-600">邮箱或名字</span>
					<input
						name="q"
						defaultValue={q}
						placeholder="user@example.com"
						className="w-full rounded-md border border-line bg-card px-3 py-2 outline-none focus:border-accent"
					/>
				</label>
				<button type="submit" className="rounded-md bg-ink px-4 py-2 text-sm text-white">
					查询
				</button>
				{billing ? <input type="hidden" name="billing" value={billing} /> : null}
			</Form>
			<div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
				{filters.map((filter) => (
					<Link
						key={filter.value}
						to={href(q, 0, filter.value)}
						prefetch="none"
						className={billing === filter.value ? "rounded-md bg-ink px-3 py-1.5 text-white" : "rounded-md border border-line bg-card px-3 py-1.5"}
						aria-current={billing === filter.value ? "page" : undefined}
					>
						{filter.label}
					</Link>
				))}
				{total !== null ? <span className="text-stone-500">{total} 人</span> : null}
			</div>
			{error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-bad">{error}</p> : null}
			<div className="mt-4 hidden overflow-x-auto rounded-xl border border-line bg-card md:block">
				<table className="w-full min-w-[1120px] text-left text-sm">
					<thead className="border-b border-line text-xs text-stone-500">
						<tr>
							<th className="px-3 py-2 font-medium">用户</th>
							<th className="px-3 py-2 font-medium">套餐</th>
							<th className="px-3 py-2 font-medium">订阅</th>
							<th className="px-3 py-2 font-medium">额度</th>
							<th className="px-3 py-2 font-medium">素材</th>
							<th className="px-3 py-2 font-medium">国家</th>
							<th className="px-3 py-2 font-medium">注册</th>
							<th className="px-3 py-2 font-medium" />
						</tr>
					</thead>
					<tbody>
						{users.length === 0 ? (
							<tr>
								<td colSpan={8} className="px-3 py-8 text-center text-stone-500">
									{error ? "没有可显示的用户" : "没有匹配的用户"}
								</td>
							</tr>
						) : (
							users.map((user) => (
								<tr key={user.id} className="border-t border-line align-top">
									<td className="px-3 py-3">
										<div className="flex flex-wrap items-center gap-2">
											<Link to={`/users/${user.id}`} className="font-medium hover:underline" prefetch="none">
												{user.name || "未命名"}
											</Link>
											<PayTags subscribed={Boolean(user.subscriptionStatus)} credits={user.purchasedCredits} />
										</div>
										<div className="text-stone-600">{user.email}</div>
										<div className="mt-1 font-mono text-xs text-stone-400">{user.id}</div>
									</td>
									<td className="px-3 py-3">
										<div>{user.plan}</div>
										<div className="text-xs text-stone-500">{planSourceLabel(user.planSource)}</div>
										{user.stripeCustomerId ? (
											<div className="mt-1">
												{user.subscriptionStatus || user.purchasedCredits ? null : <div className="text-xs text-amber-800">结账未付款</div>}
												<div className="flex items-center gap-1">
													<span className="font-mono text-xs text-stone-600">{user.stripeCustomerId}</span>
													<CopyButton value={user.stripeCustomerId} />
												</div>
											</div>
										) : (
											<div className="mt-1 text-xs text-stone-400">未结账</div>
										)}
									</td>
									<td className="px-3 py-3">
										{user.subscriptionStatus ? (
											<span className={`rounded px-1.5 py-0.5 text-xs ${statusTone(user.subscriptionStatus)}`}>
												{user.subscriptionStatus}
											</span>
										) : (
											<span className="text-stone-400">无订阅</span>
										)}
									</td>
									<td className="px-3 py-3 tabular-nums">
										{user.currentCredits} / {user.creditLimit}
									</td>
									<td className="px-3 py-3 tabular-nums">{user.assetCount}</td>
									<td className="px-3 py-3 whitespace-nowrap">{user.country ?? "—"}</td>
									<td className="px-3 py-3 whitespace-nowrap">
										<Time value={user.createdAt} />
									</td>
									<td className="px-3 py-3">
										<OpenDashboard email={user.email} compact />
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
			<ul className="mt-4 space-y-3 md:hidden">
				{users.length === 0 ? (
					<li className="rounded-xl border border-line bg-card px-3 py-8 text-center text-sm text-stone-500">{error ? "没有可显示的用户" : "没有匹配的用户"}</li>
				) : (
					users.map((user) => (
						<li key={user.id} className="rounded-xl border border-line bg-card p-3 text-sm">
							<div className="flex flex-wrap items-center gap-2">
								<Link to={`/users/${user.id}`} className="font-medium hover:underline" prefetch="none">
									{user.name || "未命名"}
								</Link>
								<PayTags subscribed={Boolean(user.subscriptionStatus)} credits={user.purchasedCredits} />
							</div>
							<div className="break-all text-stone-600">{user.email}</div>
							<div className="mt-1 break-all font-mono text-xs text-stone-400">{user.id}</div>
							<dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
								<div>
									<dt className="text-stone-500">套餐</dt>
									<dd>{user.plan} · {planSourceLabel(user.planSource)}</dd>
								</div>
								<div>
									<dt className="text-stone-500">订阅</dt>
									<dd>
										{user.subscriptionStatus ? (
											<span className={`rounded px-1.5 py-0.5 ${statusTone(user.subscriptionStatus)}`}>{user.subscriptionStatus}</span>
										) : (
											<span className="text-stone-400">无订阅</span>
										)}
									</dd>
								</div>
								<div>
									<dt className="text-stone-500">额度</dt>
									<dd className="tabular-nums">{user.currentCredits} / {user.creditLimit}</dd>
								</div>
								<div>
									<dt className="text-stone-500">素材</dt>
									<dd className="tabular-nums">{user.assetCount}</dd>
								</div>
								<div>
									<dt className="text-stone-500">国家</dt>
									<dd>{user.country ?? "—"}</dd>
								</div>
								<div>
									<dt className="text-stone-500">注册</dt>
									<dd><Time value={user.createdAt} /></dd>
								</div>
							</dl>
							<div className="mt-3 text-xs">
								{user.stripeCustomerId ? (
									<>
										{user.subscriptionStatus || user.purchasedCredits ? null : <div className="text-amber-800">结账未付款</div>}
										<div className="flex items-center gap-1">
											<span className="break-all font-mono text-stone-600">{user.stripeCustomerId}</span>
											<CopyButton value={user.stripeCustomerId} />
										</div>
									</>
								) : (
									<span className="text-stone-400">未结账</span>
								)}
							</div>
							<div className="mt-3">
								<OpenDashboard email={user.email} compact />
							</div>
						</li>
					))
				)}
			</ul>
			<div className="mt-3 flex justify-end gap-2 text-sm">
				{offset > 0 ? (
					<Link to={href(q, Math.max(0, offset - 20), billing)} className="rounded-md border border-line bg-card px-3 py-1.5" prefetch="none">
						上一页
					</Link>
				) : null}
				{hasMore ? (
					<Link to={href(q, offset + 20, billing)} className="rounded-md border border-line bg-card px-3 py-1.5" prefetch="none">
						下一页
					</Link>
				) : null}
			</div>
		</Shell>
	);
}

const filters: { value: BillingFilter | null; label: string }[] = [
	{ value: null, label: "全部" },
	{ value: "subscribed", label: "订阅的" },
	{ value: "credits", label: "积分用户" },
	{ value: "checked_out", label: "已经结账的" },
	{ value: "checkout_unpaid", label: "结账未付款" },
	{ value: "unsubscribed", label: "没有订阅的" },
];

function billingFilter(value: string | null): BillingFilter | null {
	if (value === "subscribed" || value === "checked_out" || value === "unsubscribed" || value === "checkout_unpaid" || value === "credits") return value;
	return null;
}

function Summary({ summary, billing }: { summary: BillingSummary; billing: BillingFilter | null }) {
	const items = [
		{ label: "用户", value: summary.total, billing: null },
		{ label: "已订阅", value: summary.subscribed, billing: "subscribed" as const },
		{ label: "积分用户", value: summary.creditPurchasers, billing: "credits" as const },
		{ label: "结账未付款", value: summary.checkoutUnpaid, billing: "checkout_unpaid" as const },
	];
	return (
		<section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{items.map((item) => {
				const active = billing === item.billing;
				return (
					<Link
						key={item.label}
						to={href("", 0, item.billing)}
						prefetch="none"
						className={active ? "rounded-xl border border-ink bg-ink px-4 py-3 text-white" : "rounded-xl border border-line bg-card px-4 py-3"}
					>
						<p className={active ? "text-xs text-stone-300" : "text-xs text-stone-500"}>{item.label}</p>
						<p className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</p>
					</Link>
				);
			})}
		</section>
	);
}

function href(q: string, offset: number, billing: BillingFilter | null = null) {
	const params = new URLSearchParams();
	if (q) params.set("q", q);
	if (billing) params.set("billing", billing);
	if (offset > 0) params.set("offset", String(offset));
	const query = params.toString();
	return query ? `/?${query}` : "/";
}

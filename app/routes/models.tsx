import { Link } from "react-router";
import type { Route } from "./+types/models";
import { OpenDashboard } from "../components/open-dashboard";
import { Shell, Time } from "../components/shell";
import { ForgeError, latestModels, type LatestModel } from "../lib/blockyforge.server";
import { noStoreHeaders, pageOffset, UUID } from "../lib/http";
import { requireAdmin } from "../lib/session.server";

export function meta() {
	return [{ title: "模型 · BlockyForge 管理" }, { name: "robots", content: "noindex, nofollow" }];
}

export function headers() {
	return noStoreHeaders();
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	await requireAdmin(request, env.ADMIN_KEY);
	const offset = pageOffset(new URL(request.url).searchParams.get("offset"));
	try {
		const result = await latestModels(env, offset);
		const origin = new URL(env.BLOCKYFORGE_URL).origin;
		return { ...result, offset, origin, error: null };
	} catch (error) {
		if (error instanceof ForgeError) return { models: [] as LatestModel[], total: 0, offset, origin: "", error: error.message };
		throw error;
	}
}

export default function Models({ loaderData }: Route.ComponentProps) {
	const { models, total, offset, origin, error } = loaderData;
	return (
		<Shell>
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h1 className="text-xl font-semibold">模型</h1>
				<p className="text-sm text-stone-500">每个素材展示最新模型 · 共 {total} 个</p>
			</div>
			<p className="mt-2 text-sm text-stone-500">先授权登录，再打开素材详情。</p>
			{error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-bad">{error}</p> : null}
			<div className="mt-4 overflow-x-auto rounded-xl border border-line bg-card">
				<table className="w-full min-w-[800px] text-left text-sm">
					<thead className="border-b border-line text-xs text-stone-500"><tr>
						<th className="px-3 py-2 font-medium">预览图</th><th className="px-3 py-2 font-medium">素材</th><th className="px-3 py-2 font-medium">用户 email</th><th className="px-3 py-2 font-medium">gamingId</th><th className="px-3 py-2 font-medium">模型创建时间</th><th className="px-3 py-2 font-medium">操作</th>
					</tr></thead>
					<tbody>
						{models.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-stone-500">{error ? "没有可显示的模型" : "没有模型"}</td></tr> : models.map((model) => <tr key={model.assetId} className="border-t border-line align-top">
							<td className="px-3 py-3">{model.hasThumbnail && UUID.test(model.assetId) ? <img src={`/thumbnails/${model.assetId}`} alt={`${model.assetName} 预览`} className="h-16 w-16 rounded-md bg-stone-200 object-cover" /> : <div className="h-16 w-16 rounded-md bg-stone-200" aria-label="暂无预览图" />}</td>
							<td className="px-3 py-3"><div>{model.assetName}</div><div className="mt-1 font-mono text-xs text-stone-400">{model.assetId}</div></td>
							<td className="px-3 py-3"><Link to={`/users/${model.userId}`} className="hover:underline" prefetch="none">{model.email}</Link></td>
							<td className="px-3 py-3 font-mono text-xs">{model.gamingId}</td>
							<td className="whitespace-nowrap px-3 py-3"><Time value={model.createdAt} /></td>
							<td className="space-y-2 px-3 py-3"><OpenDashboard email={model.email} compact />{UUID.test(model.assetId) ? <a href={`${origin}/dashboard/assets/${model.assetId}`} className="block whitespace-nowrap text-right text-accent hover:underline">打开素材详情</a> : null}</td>
						</tr>)}
					</tbody>
				</table>
			</div>
			<div className="mt-3 flex justify-end gap-2 text-sm">
				{offset > 0 ? <Link to={modelHref(Math.max(0, offset - 20))} className="rounded-md border border-line bg-card px-3 py-1.5" prefetch="none">上一页</Link> : null}
				{offset + 20 < total ? <Link to={modelHref(offset + 20)} className="rounded-md border border-line bg-card px-3 py-1.5" prefetch="none">下一页</Link> : null}
			</div>
		</Shell>
	);
}

function modelHref(offset: number) {
	return offset ? `/models?offset=${offset}` : "/models";
}

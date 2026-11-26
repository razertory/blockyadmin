import type { Route } from "./+types/statistics";
import { Shell } from "../components/shell";
import { dailyTokenUsage, ForgeError, type TokenUsageDay } from "../lib/blockyforge.server";
import { noStoreHeaders } from "../lib/http";
import { requireAdmin } from "../lib/session.server";
import { estimateCostUsd, formatCompact, formatInt, formatUsd } from "../lib/tokens";

export function meta() {
	return [{ title: "统计 · BlockyForge 管理" }, { name: "robots", content: "noindex, nofollow" }];
}

export function headers() {
	return noStoreHeaders();
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	await requireAdmin(request, env.ADMIN_KEY);
	try {
		const usage = await dailyTokenUsage(env);
		return { ...usage, error: null };
	} catch (error) {
		if (error instanceof ForgeError) {
			return { days: [] as TokenUsageDay[], totalTasks: 0, totalInput: 0, totalOutput: 0, error: error.message };
		}
		throw error;
	}
}

export default function Statistics({ loaderData }: Route.ComponentProps) {
	const { days, totalTasks, totalInput, totalOutput, error } = loaderData;
	const totalTokens = totalInput + totalOutput;
	const cost = estimateCostUsd(totalInput, totalOutput);
	return (
		<Shell>
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h1 className="text-xl font-semibold">统计</h1>
				<p className="text-sm text-stone-500">最近 7 天模型生成 token 用量 · 按北京时间分日 · 今天为不完整日</p>
			</div>

			{error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-bad">{error}</p> : null}
			{!error ? (
				totalTasks === 0 ? (
					<p className="mt-6 rounded-xl border border-line bg-card px-3 py-8 text-center text-sm text-stone-500">最近 7 天没有生成任务。</p>
				) : (
					<>
						<section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							<StatCard label="生成任务" value={formatInt(totalTasks)} />
							<StatCard label="Token 合计" value={formatInt(totalTokens)} />
							<StatCard label="输入 tokens" value={formatInt(totalInput)} swatch="bg-accent" />
							<StatCard label="输出 tokens" value={formatInt(totalOutput)} swatch="bg-amber-500" />
							<StatCard label="市场价开销（预估）" value={formatUsd(cost.market)} />
							<StatCard label="折扣价开销（预估）" value={formatUsd(cost.discount)} />
						</section>
						<Chart days={days} />
						<UsageTable days={days} totalInput={totalInput} totalOutput={totalOutput} />
						<p className="mt-3 text-xs text-stone-500">
							费用按 GPT-6.2 Sol 等值市场价估算：未缓存输入 $2.00、命中缓存输入 $0.10、输出 $10.00（每 1M tokens），输入缓存命中率按 80% 计；折扣价为市场价的 11%。
						</p>
					</>
				)
			) : null}
		</Shell>
	);
}

function StatCard({ label, value, swatch }: { label: string; value: string; swatch?: string }) {
	return (
		<div className="rounded-xl border border-line bg-card px-4 py-3">
			<p className="flex items-center gap-1.5 text-xs text-stone-500">
				{swatch ? <span className={`inline-block h-2.5 w-2.5 rounded-sm ${swatch}`} /> : null}
				{label}
			</p>
			<p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
		</div>
	);
}

const BAR_HEIGHT_PX = 224;

function Chart({ days }: { days: TokenUsageDay[] }) {
	const maxBar = Math.max(1, ...days.flatMap((day) => [day.inputTokens, day.outputTokens]));
	const maxDay = Math.max(1, ...days.map((day) => day.inputTokens + day.outputTokens));
	const ticks = [1, 0.75, 0.5, 0.25, 0];
	const today = days[days.length - 1]?.date;
	return (
		<section className="mt-4 rounded-xl border border-line bg-card p-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 className="text-sm font-medium">每日 token 用量</h2>
				<div className="flex items-center gap-4 text-xs text-stone-600">
					<span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" />输入 (prompt)</span>
					<span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" />输出 (completion)</span>
				</div>
			</div>
			<div className="mt-4 flex gap-2">
				<div className="relative shrink-0 text-right text-[10px] leading-none text-stone-400 tabular-nums" style={{ height: `${BAR_HEIGHT_PX}px`, width: "3.25rem" }}>
					{ticks.map((tick) => (
						<span key={tick} className="absolute right-0" style={{ top: `${(1 - tick) * 100}%`, transform: "translateY(-50%)" }}>
							{formatCompact(maxDay * tick)}
						</span>
					))}
				</div>
				<div className="relative min-w-0 flex-1" style={{ height: `${BAR_HEIGHT_PX}px` }}>
					{ticks.map((tick) => (
						<div key={tick} className="absolute inset-x-0 border-t border-line" style={{ top: `${(1 - tick) * 100}%` }} />
					))}
					<div className="absolute inset-0 flex items-end">
						{days.map((day) => (
							<div key={day.date} className="flex h-full min-w-0 flex-1 items-end justify-center gap-1">
								<Bar value={day.inputTokens} max={maxBar} tone="bg-accent" title={`${day.date} 输入：${formatInt(day.inputTokens)} tokens`} />
								<Bar value={day.outputTokens} max={maxBar} tone="bg-amber-500" title={`${day.date} 输出：${formatInt(day.outputTokens)} tokens`} />
							</div>
						))}
					</div>
				</div>
			</div>
			<div className="mt-2 flex gap-2">
				<div className="shrink-0" style={{ width: "3.25rem" }} />
				<div className="flex min-w-0 flex-1">
					{days.map((day) => (
						<div key={day.date} className="min-w-0 flex-1 text-center text-xs text-stone-600">
							{day.date.slice(5)}
							<span className="block text-[10px] text-stone-400">{day.date === today ? "今天" : day.weekday}</span>
						</div>
					))}
				</div>
			</div>
			<p className="mt-3 text-xs text-stone-500">已取消或失败的任务通常没有 token 记录，不计入用量。</p>
		</section>
	);
}

function Bar({ value, max, tone, title }: { value: number; max: number; tone: string; title: string }) {
	const pct = value > 0 ? Math.max(1.5, (value / max) * 100) : 0;
	return (
		<div className="h-full w-3.5 sm:w-6" title={title}>
			{pct > 0 ? <div className={`w-full rounded-t-sm ${tone}`} style={{ height: `${pct}%` }} /> : null}
		</div>
	);
}

function UsageTable({ days, totalInput, totalOutput }: { days: TokenUsageDay[]; totalInput: number; totalOutput: number }) {
	return (
		<div className="mt-4 overflow-x-auto rounded-xl border border-line bg-card">
			<table className="w-full min-w-[560px] text-left text-sm">
				<thead className="border-b border-line text-xs text-stone-500">
					<tr>
						<th className="px-3 py-2 font-medium">日期</th>
						<th className="px-3 py-2 font-medium">任务数</th>
						<th className="px-3 py-2 font-medium">输入 tokens</th>
						<th className="px-3 py-2 font-medium">输出 tokens</th>
						<th className="px-3 py-2 font-medium">合计</th>
					</tr>
				</thead>
				<tbody>
					{days.map((day) => (
						<tr key={day.date} className="border-t border-line">
							<td className="px-3 py-2 whitespace-nowrap">{day.date} {day.weekday}</td>
							<td className="px-3 py-2 tabular-nums">{day.tasks}</td>
							<td className="px-3 py-2 tabular-nums">{formatInt(day.inputTokens)}</td>
							<td className="px-3 py-2 tabular-nums">{formatInt(day.outputTokens)}</td>
							<td className="px-3 py-2 tabular-nums">{formatInt(day.inputTokens + day.outputTokens)}</td>
						</tr>
					))}
				</tbody>
				<tfoot className="border-t border-line font-medium">
					<tr>
						<td className="px-3 py-2">合计</td>
						<td className="px-3 py-2 tabular-nums">{formatInt(days.reduce((sum, day) => sum + day.tasks, 0))}</td>
						<td className="px-3 py-2 tabular-nums">{formatInt(totalInput)}</td>
						<td className="px-3 py-2 tabular-nums">{formatInt(totalOutput)}</td>
						<td className="px-3 py-2 tabular-nums">{formatInt(totalInput + totalOutput)}</td>
					</tr>
				</tfoot>
			</table>
		</div>
	);
}


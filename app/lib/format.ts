export function formatTime(value: unknown): string {
	const date = toDate(value);
	if (!date) return "—";
	return new Intl.DateTimeFormat("zh-CN", {
		timeZone: "Asia/Shanghai",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(date);
}

export function toIso(value: unknown): string | null {
	return toDate(value)?.toISOString() ?? null;
}

function toDate(value: unknown): Date | null {
	if (value == null || value === "") return null;
	if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) {
		const n = Number(value);
		if (!Number.isFinite(n)) return null;
		const date = new Date(n < 1e12 ? n * 1000 : n);
		return Number.isNaN(date.getTime()) ? null : date;
	}
	if (typeof value !== "string") return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function planSourceLabel(source: string | null): string {
	if (source === "manual") return "手动授予";
	if (source === "stripe") return "Stripe";
	if (!source) return "无付费来源";
	return source;
}

export function statusTone(status: string): string {
	if (status === "ready" || status === "active" || status === "trialing") {
		return "bg-emerald-100 text-emerald-950";
	}
	if (status === "failed" || status === "canceled" || status === "unpaid" || status === "past_due") {
		return "bg-red-100 text-red-950";
	}
	if (status === "generating" || status === "pending" || status === "incomplete") {
		return "bg-amber-100 text-amber-950";
	}
	return "bg-stone-200 text-stone-800";
}

export function text(value: unknown): string {
	return typeof value === "string" ? value : "";
}

export function nullableText(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

export function nullableNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const intFormat = new Intl.NumberFormat("zh-CN");
const compactFormat = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });
const usdFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatInt(value: number): string {
	return intFormat.format(value);
}

export function formatCompact(value: number): string {
	return compactFormat.format(value);
}

export function formatUsd(value: number): string {
	return usdFormat.format(value);
}

// GPT-6.2 Sol 等值市场价（USD / 1M tokens）。
export const USD_PER_1M_UNCACHED_INPUT = 2.0;
export const USD_PER_1M_CACHED_INPUT = 0.1;
export const USD_PER_1M_OUTPUT = 10.0;
// 输入缓存命中率按 80% 计；折扣价为市场价的 11%。
export const CACHE_HIT_RATE = 0.8;
export const DISCOUNT_RATE = 0.11;

export function estimateCostUsd(inputTokens: number, outputTokens: number): { market: number; discount: number } {
	const perInput =
		CACHE_HIT_RATE * USD_PER_1M_CACHED_INPUT + (1 - CACHE_HIT_RATE) * USD_PER_1M_UNCACHED_INPUT;
	const market = (inputTokens / 1e6) * perInput + (outputTokens / 1e6) * USD_PER_1M_OUTPUT;
	return { market, discount: market * DISCOUNT_RATE };
}

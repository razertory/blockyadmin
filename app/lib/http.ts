export function noStoreHeaders(): HeadersInit {
	return {
		"Cache-Control": "no-store",
		"Referrer-Policy": "no-referrer",
		"X-Robots-Tag": "noindex, nofollow",
		"X-Content-Type-Options": "nosniff",
	};
}

export const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pageOffset(value: string | null): number {
	if (!value) return 0;
	if (!/^\d{1,7}$/.test(value)) return 0;
	const offset = Number(value);
	return offset <= 1_000_000 ? offset : 0;
}

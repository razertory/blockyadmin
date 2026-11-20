import { countryName } from "./country";
import { umami } from "./umami";

const LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

export async function userCountryNames(ids: string[]) {
	const unique = [...new Set(ids)];
	const entries = await Promise.all(unique.map(async (id) => [id, await countryForUser(id)] as const));
	return new Map(entries);
}

async function countryForUser(id: string) {
	const endAt = Date.now();
	const url = new URL(`/api/websites/${umami.siteId}/sessions`, umami.url);
	url.searchParams.set("startAt", String(endAt - LOOKBACK_MS));
	url.searchParams.set("endAt", String(endAt));
	url.searchParams.set("distinctId", id);
	url.searchParams.set("pageSize", "1");
	try {
		const response = await fetch(url, {
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${umami.key}`,
			},
		});
		if (!response.ok) return null;
		const body = (await response.json()) as { data?: { country?: string | null }[] };
		return countryName(body.data?.[0]?.country);
	} catch {
		return null;
	}
}

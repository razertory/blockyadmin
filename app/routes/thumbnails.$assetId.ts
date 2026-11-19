import type { Route } from "./+types/thumbnails.$assetId";
import { assetThumbnail, ForgeError } from "../lib/blockyforge.server";
import { noStoreHeaders, UUID } from "../lib/http";
import { requireAdmin } from "../lib/session.server";

export async function loader({ request, context, params }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	await requireAdmin(request, env.ADMIN_KEY);
	if (!UUID.test(params.assetId)) {
		return new Response("素材不存在", { status: 404, headers: noStoreHeaders() });
	}
	try {
		const upstream = await assetThumbnail(env, params.assetId);
		const type = upstream.headers.get("Content-Type") ?? "";
		if (!upstream.ok || !type.startsWith("image/")) {
			return new Response("缩略图不可用", { status: 404, headers: noStoreHeaders() });
		}
		return new Response(upstream.body, {
			headers: {
				"Content-Type": type,
				"Cache-Control": "private, no-store",
				"Referrer-Policy": "no-referrer",
				"X-Content-Type-Options": "nosniff",
			},
		});
	} catch (error) {
		if (error instanceof ForgeError) {
			return new Response(error.message, { status: error.status, headers: noStoreHeaders() });
		}
		throw error;
	}
}

import { data, redirect, Form } from "react-router";
import type { Route } from "./+types/login";
import { noStoreHeaders } from "../lib/http";
import { hasSession, passwordsMatch, sessionCookie } from "../lib/session.server";

export function meta({}: Route.MetaArgs) {
	return [{ title: "登录 · BlockyForge 管理" }, { name: "robots", content: "noindex, nofollow" }];
}

export function headers() {
	return noStoreHeaders();
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const password = context.cloudflare.env.ADMIN_KEY;
	if (await hasSession(request, password)) throw redirect("/");
	return { configured: Boolean(password) };
}

export async function action({ request, context }: Route.ActionArgs) {
	const password = context.cloudflare.env.ADMIN_KEY;
	if (!password) {
		return data({ error: "服务器未配置 ADMIN_KEY。" }, { status: 503, headers: noStoreHeaders() });
	}
	const form = await request.formData();
	const submitted = String(form.get("password") ?? "");
	if (!(await passwordsMatch(submitted, password))) {
		return data({ error: "密码不正确。" }, { status: 401, headers: noStoreHeaders() });
	}
	return redirect("/", {
		headers: { "Set-Cookie": await sessionCookie(request, password), ...noStoreHeaders() },
	});
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
	return (
		<main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
			<h1 className="text-xl font-semibold">BlockyForge 管理</h1>
			<p className="mt-2 text-sm leading-6 text-stone-600">使用 BlockyForge 的 ADMIN_KEY 进入。它只用于这次登录，不会留在页面上。</p>
			<Form method="post" className="mt-6 space-y-3 rounded-xl border border-line bg-card p-4" replace>
				<label className="block text-sm">
					<span className="mb-1 block text-stone-600">密码</span>
					<input
						name="password"
						type="password"
						autoComplete="current-password"
						required
						className="w-full rounded-md border border-line bg-white px-3 py-2 outline-none focus:border-accent"
					/>
				</label>
				{actionData?.error ? <p className="text-sm text-bad">{actionData.error}</p> : null}
				{loaderData.configured ? null : <p className="text-sm text-bad">服务器未配置 ADMIN_KEY。</p>}
				<button type="submit" className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink">
					进入
				</button>
			</Form>
		</main>
	);
}

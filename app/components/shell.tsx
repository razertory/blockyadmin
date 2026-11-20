import { Form, Link } from "react-router";
import { formatTime, toIso } from "../lib/format";

export function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-screen">
			<header className="border-b border-line bg-card">
				<div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
					<div>
						<Link to="/" className="text-sm font-semibold tracking-tight" prefetch="none">
							BlockyForge 管理
						</Link>
						<p className="text-xs text-stone-500">查询用户、付费和素材，并签发只读登录</p>
					</div>
					<nav className="flex items-center gap-3 text-sm" aria-label="管理导航">
						<Link to="/" className="text-stone-600 hover:text-ink" prefetch="none">用户</Link>
						<Link to="/models" className="text-stone-600 hover:text-ink" prefetch="none">模型</Link>
					<Form method="post" action="/logout">
						<button type="submit" className="rounded-md px-2 py-1 text-sm text-stone-600 hover:bg-stone-100">
							退出
						</button>
					</Form>
					</nav>
				</div>
			</header>
			<main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
		</div>
	);
}

export function Time({ value }: { value: unknown }) {
	const iso = toIso(value);
	if (!iso) return <>—</>;
	return (
		<time dateTime={iso} title={`${iso} UTC`}>
			{formatTime(value)}
		</time>
	);
}

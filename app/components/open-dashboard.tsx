import { useRef, useState } from "react";

export function OpenDashboard({ email, compact = false }: { email: string; compact?: boolean }) {
	const lock = useRef(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function open() {
		if (lock.current) return;
		lock.current = true;
		setPending(true);
		setError(null);
		// Open during the click so the browser still treats this as a user gesture after the request.
		const tab = window.open("about:blank", "_blank");
		if (!tab) {
			setError("浏览器拦截了新标签页，请允许弹窗后重试");
			lock.current = false;
			setPending(false);
			return;
		}
		try {
			const response = await fetch("/api/dashboard-access", {
				method: "POST",
				headers: { "Content-Type": "application/json", Accept: "application/json" },
				body: JSON.stringify({ email }),
				cache: "no-store",
			});
			const body = (await response.json().catch(() => null)) as { url?: unknown; error?: unknown } | null;
			const url = typeof body?.url === "string" ? body.url : "";
			if (!response.ok || !url.startsWith("https://")) {
				tab.close();
				setError(typeof body?.error === "string" ? body.error : "无法签发登录链接");
				return;
			}
			tab.opener = null;
			tab.location.replace(url);
		} catch {
			tab.close();
			setError("网络错误，请重试");
		} finally {
			lock.current = false;
			setPending(false);
		}
	}

	return (
		<div className={compact ? "text-right" : "space-y-2"}>
			<button
				type="button"
				onClick={open}
				disabled={pending}
				className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink disabled:opacity-60"
			>
				{pending ? "正在打开…" : "授权登录"}
			</button>
			{error ? <p className="mt-1 text-xs text-bad">{error}</p> : null}
			{compact ? null : (
				<p className="max-w-md text-xs leading-5 text-stone-500">
					链接 60 秒内有效，会在新标签页打开该用户 30 分钟的只读 Dashboard。
				</p>
			)}
		</div>
	);
}

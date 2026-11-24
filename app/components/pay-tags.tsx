export function PayTags({ subscribed, credits }: { subscribed: boolean; credits: boolean }) {
	if (!subscribed && !credits) return null;
	return (
		<span className="inline-flex flex-wrap gap-1">
			{credits ? <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-950">积分</span> : null}
			{subscribed ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-950">订阅</span> : null}
		</span>
	);
}

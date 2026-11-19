import { useState } from "react";

export function CopyButton({ value }: { value: string }) {
	const [done, setDone] = useState(false);
	return (
		<button
			type="button"
			className="rounded px-1.5 py-0.5 text-xs text-stone-500 hover:bg-stone-100"
			onClick={async () => {
				await navigator.clipboard.writeText(value);
				setDone(true);
				window.setTimeout(() => setDone(false), 1200);
			}}
		>
			{done ? "已复制" : "复制"}
		</button>
	);
}

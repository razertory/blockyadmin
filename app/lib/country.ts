const regionNames = new Intl.DisplayNames(["zh-Hans"], { type: "region" });

export function countryName(code: string | null | undefined) {
	if (!code) return null;
	try {
		return regionNames.of(code) ?? code;
	} catch {
		return code;
	}
}

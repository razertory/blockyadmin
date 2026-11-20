import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("models", "routes/models.tsx"),
	route("login", "routes/login.tsx"),
	route("logout", "routes/logout.ts"),
	route("users/:id", "routes/users.$id.tsx"),
	route("api/dashboard-access", "routes/api.dashboard-access.ts"),
	route("thumbnails/:assetId", "routes/thumbnails.$assetId.ts"),
] satisfies RouteConfig;

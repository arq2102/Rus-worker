import { defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "rus-worker",
		compatibilityDate: "2026-11-19",
		entrypoint,
		// Любой неизвестный путь отдаёт index.html, а маршрут разбирает клиент.
		assets: {
			notFoundHandling: "single-page-application",
			// Иначе при открытии /api/... прямо в браузере вернулась бы страница SPA.
			runWorkerFirst: ["/api/*"],
		},
	},
});

// Страницу и скрипты отдаёт раздел assets (см. cloudflare.config.ts).
// Сюда попадают только запросы, для которых не нашлось статического ответа.
export default {
	fetch() {
		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler;

// API сайта: /api/dashboard отдаёт погоду и курсы валют одним ответом.
// Страницу и скрипты отдаёт раздел assets (см. cloudflare.config.ts).

import {
	CURRENCIES,
	fetchForecast,
	getJson,
	placeFromSearch,
	type Dashboard,
	type Place,
	type Rates,
} from "../client/weather.ts";

const DEFAULT_PLACE: Place = { name: "Москва", lat: 55.7522, lon: 37.6156 };
const RATES_URL = "https://open.er-api.com/v6/latest/USD";

interface RatesResponse {
	result: string;
	time_last_update_unix: number;
	rates: Record<string, number>;
}

// Cloudflare держит успешные ответы источников в кэше, чтобы реже к ним обращаться.
function cached(seconds: number): RequestInit {
	const init = {
		signal: AbortSignal.timeout(8000),
		cf: { cacheTtlByStatus: { "200-299": seconds, "300-599": 0 } },
	};
	return init;
}

async function fetchRates(): Promise<Rates> {
	const data = await getJson<RatesResponse>(RATES_URL, cached(3600));
	if (data.result !== "success") {
		throw new Error("Сервис курсов вернул ошибку");
	}
	const values: Record<string, number> = {};
	for (const code of CURRENCIES) {
		const value = data.rates[code];
		if (value === undefined) {
			throw new Error(`Нет курса ${code}`);
		}
		values[code] = value;
	}
	return {
		base: "USD",
		updated: new Date(data.time_last_update_unix * 1000).toISOString(),
		values,
	};
}

async function dashboard(url: URL): Promise<Response> {
	// Без координат отвечаем по Москве, чтобы адрес можно было просто открыть в браузере.
	const hasPlace = url.searchParams.has("lat") || url.searchParams.has("lon");
	const place = hasPlace ? placeFromSearch(url.search) : DEFAULT_PLACE;
	if (!place) {
		return Response.json({ error: "Неверные координаты" }, { status: 400 });
	}
	try {
		// Promise.all: оба запроса уходят одновременно, ждём оба ответа.
		// Если не удался хотя бы один, не удаётся всё.
		const [forecast, rates] = await Promise.all([fetchForecast(place, cached(600)), fetchRates()]);
		return Response.json({ forecast, rates } satisfies Dashboard);
	} catch (error) {
		console.error("dashboard:", error);
		const reason = error instanceof Error ? error.message : String(error);
		return Response.json({ error: "Не удалось получить данные", reason }, { status: 502 });
	}
}

export default {
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/api/dashboard") {
			return dashboard(url);
		}
		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler;

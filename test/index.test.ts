import { afterEach, expect, it, vi } from "vite-plus/test";
import {
	CURRENCIES,
	describe,
	formatTemp,
	placeFromSearch,
	placeToUrl,
} from "../client/weather.ts";
import worker from "../src/index.ts";

afterEach(() => {
	vi.unstubAllGlobals();
});

const RATES = {
	result: "success",
	time_last_update_unix: 0,
	rates: Object.fromEntries(CURRENCIES.map((code, i) => [code, i + 1])),
};

function call(path: string): Promise<Response> {
	return worker.fetch(new Request(`https://example.com${path}`));
}

it("requests weather and rates at the same time and returns both", async () => {
	const pending = new Map<string, (response: Response) => void>();
	vi.stubGlobal("fetch", (input: string | URL) => {
		const { promise, resolve } = Promise.withResolvers<Response>();
		pending.set(new URL(input).host, resolve);
		return promise;
	});

	const responsePromise = call("/api/dashboard");
	// Оба запроса уже отправлены, хотя ни один ещё не получил ответа.
	expect([...pending.keys()].sort()).toEqual(["api.open-meteo.com", "open.er-api.com"]);

	pending.get("api.open-meteo.com")?.(Response.json({ current: { temperature_2m: 1 } }));
	pending.get("open.er-api.com")?.(Response.json(RATES));
	const response = await responsePromise;

	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({
		forecast: { current: { temperature_2m: 1 } },
		rates: { base: "USD", values: { KZT: 1 } },
	});
});

it("fails as a whole when one of the two requests fails", async () => {
	vi.stubGlobal("fetch", async (input: string | URL) =>
		new URL(input).host === "open.er-api.com"
			? new Response("limit", { status: 429 })
			: Response.json({}),
	);
	const response = await call("/api/dashboard");
	expect(response.status).toBe(502);
	expect(await response.json()).toMatchObject({ reason: "HTTP 429" });
});

it("rejects invalid coordinates and unknown API paths", async () => {
	expect((await call("/api/dashboard?lat=100&lon=1")).status).toBe(400);
	expect((await call("/api/unknown")).status).toBe(404);
});

it("keeps the selected place in the URL", () => {
	const place = { name: "Санкт-Петербург", lat: 59.94, lon: 30.31 };
	const url = new URL(placeToUrl(place), "https://example.com");
	expect(url.pathname).toBe("/weather");
	expect(placeFromSearch(url.search)).toEqual(place);
});

it("rejects missing or invalid coordinates", () => {
	expect(placeFromSearch("")).toBeNull();
	expect(placeFromSearch("?lat=abc&lon=1")).toBeNull();
	expect(placeFromSearch("?lat=100&lon=1")).toBeNull();
});

it("formats temperature and weather codes", () => {
	expect(formatTemp(3.6)).toBe("+4°");
	expect(formatTemp(-0.2)).toBe("0°");
	expect(formatTemp(-7)).toBe("-7°");
	expect(describe(0, false).icon).toBe("🌙");
	expect(describe(63).text).toBe("Дождь");
	expect(describe(95).text).toBe("Гроза");
});

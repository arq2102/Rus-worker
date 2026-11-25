import { expect, it } from "vite-plus/test";
import { describe, formatTemp, placeFromSearch, placeToUrl } from "../client/weather.ts";

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

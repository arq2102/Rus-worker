// Запросы и разбор данных. Здесь нет работы с DOM, поэтому файл используют и браузер, и Worker.

// Курс этих валют показываем: сколько единиц стоит 1 доллар.
export const CURRENCIES = ["KZT", "RUB", "EUR", "CNY", "GBP", "TRY"] as const;

export interface Rates {
	base: "USD";
	updated: string; // когда источник обновил курсы, ISO 8601
	values: Record<string, number>;
}

// Ответ нашего Worker на /api/dashboard.
export interface Dashboard {
	forecast: Forecast;
	rates: Rates;
}

export interface Place {
	name: string;
	lat: number;
	lon: number;
}

export interface City extends Place {
	region: string;
}

export interface Forecast {
	current: {
		temperature_2m: number;
		apparent_temperature: number;
		relative_humidity_2m: number;
		wind_speed_10m: number;
		weather_code: number;
		is_day: number;
	};
	hourly: {
		time: string[];
		temperature_2m: number[];
		weather_code: number[];
		precipitation_probability: (number | null)[];
	};
	daily: {
		time: string[];
		weather_code: number[];
		temperature_2m_max: number[];
		temperature_2m_min: number[];
		precipitation_probability_max: (number | null)[];
	};
}

interface GeocodingResponse {
	results?: {
		name: string;
		latitude: number;
		longitude: number;
		admin1?: string;
		country?: string;
	}[];
}

export async function getJson<T>(url: string | URL, init: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	if (!response.ok) {
		const source = response.url ? ` (${new URL(response.url).host})` : "";
		throw new Error(`HTTP ${response.status}${source}`);
	}
	return (await response.json()) as T;
}

export async function searchCities(query: string, signal: AbortSignal): Promise<City[]> {
	const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
	url.search = new URLSearchParams({ name: query, count: "5", language: "ru" }).toString();
	const data = await getJson<GeocodingResponse>(url, { signal });
	return (data.results ?? []).map((item) => ({
		name: item.name,
		lat: item.latitude,
		lon: item.longitude,
		region: [item.admin1, item.country].filter(Boolean).join(", "),
	}));
}

export function fetchDashboard(place: Place, signal: AbortSignal): Promise<Dashboard> {
	const params = new URLSearchParams({ lat: String(place.lat), lon: String(place.lon) });
	return getJson<Dashboard>(`/api/dashboard?${params}`, { signal });
}

export function fetchForecast(place: Place, init: RequestInit): Promise<Forecast> {
	const url = new URL("https://api.open-meteo.com/v1/forecast");
	url.search = new URLSearchParams({
		latitude: String(place.lat),
		longitude: String(place.lon),
		current:
			"temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day",
		hourly: "temperature_2m,weather_code,precipitation_probability",
		daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
		forecast_days: "7",
		forecast_hours: "24",
		wind_speed_unit: "ms",
		timezone: "auto",
	}).toString();
	return getJson<Forecast>(url, init);
}

// Коды погоды WMO: [максимальный код группы, значок, описание].
const WEATHER: [number, string, string][] = [
	[0, "☀️", "Ясно"],
	[2, "🌤️", "Переменная облачность"],
	[3, "☁️", "Пасмурно"],
	[48, "🌫️", "Туман"],
	[57, "🌦️", "Морось"],
	[67, "🌧️", "Дождь"],
	[77, "🌨️", "Снег"],
	[82, "🌧️", "Ливень"],
	[86, "🌨️", "Снегопад"],
	[99, "⛈️", "Гроза"],
];

export function describe(code: number, isDay = true): { icon: string; text: string } {
	const [, icon, text] = WEATHER.find(([max]) => code <= max) ?? [0, "❔", "Нет данных"];
	return { icon: code === 0 && !isDay ? "🌙" : icon, text };
}

export function formatTemp(value: number): string {
	const rounded = Math.round(value);
	return `${rounded > 0 ? "+" : ""}${rounded === 0 ? 0 : rounded}°`;
}

// Место хранится в адресе страницы, поэтому ссылкой можно поделиться.
export function placeFromSearch(search: string): Place | null {
	const params = new URLSearchParams(search);
	const rawLat = params.get("lat");
	const rawLon = params.get("lon");
	if (!rawLat || !rawLon) {
		return null;
	}
	const lat = Number(rawLat);
	const lon = Number(rawLon);
	if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) {
		return null;
	}
	return { name: params.get("name") || "Выбранное место", lat, lon };
}

export function placeToUrl(place: Place): string {
	const params = new URLSearchParams({
		name: place.name,
		lat: String(place.lat),
		lon: String(place.lon),
	});
	return `/weather?${params}`;
}

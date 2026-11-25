// Интерфейс и маршрутизация SPA: страница не перезагружается.

import {
	describe,
	fetchForecast,
	formatTemp,
	placeFromSearch,
	placeToUrl,
	searchCities,
	type Forecast,
	type Place,
} from "./weather.ts";

const DEFAULT_PLACE: Place = { name: "Москва", lat: 55.7522, lon: 37.6156 };

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
	const element = document.getElementById(id);
	if (!element) {
		throw new Error(`Нет элемента #${id}`);
	}
	return element as T;
}

const form = byId<HTMLFormElement>("search");
const input = byId<HTMLInputElement>("query");
const results = byId("results");
const status = byId("status");
const weather = byId("weather");

// Новое действие отменяет предыдущее, чтобы старый ответ не затёр новый.
let controller = new AbortController();

function startRequest(message: string): AbortSignal {
	controller.abort();
	controller = new AbortController();
	results.hidden = true;
	status.textContent = message;
	return controller.signal;
}

function navigate(place: Place): void {
	history.pushState(null, "", placeToUrl(place));
	void showRoute();
}

async function showRoute(): Promise<void> {
	const place = placeFromSearch(location.search) ?? DEFAULT_PLACE;
	const signal = startRequest("Загружаю прогноз…");
	weather.hidden = true;
	try {
		const forecast = await fetchForecast(place, signal);
		if (signal.aborted) {
			return;
		}
		render(place, forecast);
		status.textContent = "";
	} catch {
		if (!signal.aborted) {
			status.textContent = "Не удалось загрузить прогноз. Обновите страницу чуть позже.";
		}
	}
}

// Текст вставляется только через textContent, без innerHTML.
function span(text: string, tag = "span"): HTMLElement {
	const element = document.createElement(tag);
	element.textContent = text;
	return element;
}

function listItem(...children: HTMLElement[]): HTMLLIElement {
	const item = document.createElement("li");
	item.append(...children);
	return item;
}

function rain(probability: number | null | undefined): string {
	return probability == null ? "" : `💧${probability}%`;
}

function render(place: Place, { current, hourly, daily }: Forecast): void {
	const now = describe(current.weather_code, current.is_day === 1);
	document.title = `Погода: ${place.name}`;
	byId("place").textContent = place.name;
	byId("icon").textContent = now.icon;
	byId("temp").textContent = formatTemp(current.temperature_2m);
	byId("summary").textContent = now.text;
	byId("feels").textContent = formatTemp(current.apparent_temperature);
	byId("humidity").textContent = `${current.relative_humidity_2m}%`;
	byId("wind").textContent = `${Math.round(current.wind_speed_10m)} м/с`;

	byId("hourly").replaceChildren(
		...hourly.time.map((time, i) =>
			listItem(
				// Время уже в часовом поясе выбранного места.
				span(time.slice(11, 16), "small"),
				span(describe(hourly.weather_code[i] ?? -1).icon),
				span(formatTemp(hourly.temperature_2m[i] ?? 0)),
				span(rain(hourly.precipitation_probability[i]), "small"),
			),
		),
	);

	const dayName = new Intl.DateTimeFormat("ru", {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	});
	byId("daily").replaceChildren(
		...daily.time.map((date, i) => {
			const day = describe(daily.weather_code[i] ?? -1);
			const icon = span(day.icon);
			icon.title = day.text;
			return listItem(
				span(dayName.format(new Date(date))),
				icon,
				span(rain(daily.precipitation_probability_max[i]), "small"),
				span(
					`${formatTemp(daily.temperature_2m_min[i] ?? 0)} … ${formatTemp(daily.temperature_2m_max[i] ?? 0)}`,
				),
			);
		}),
	);
	weather.hidden = false;
}

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	const signal = startRequest("Ищу город…");
	try {
		const cities = await searchCities(input.value.trim(), signal);
		if (signal.aborted) {
			return;
		}
		status.textContent = cities.length ? "" : "Город не найден.";
		results.replaceChildren(
			...cities.map((city) => {
				const button = document.createElement("button");
				button.type = "button";
				button.append(span(`${city.name} `), span(city.region, "small"));
				button.addEventListener("click", () => {
					input.value = "";
					navigate({ name: city.name, lat: city.lat, lon: city.lon });
				});
				return listItem(button);
			}),
		);
		results.hidden = cities.length === 0;
	} catch {
		if (!signal.aborted) {
			status.textContent = "Поиск не сработал. Попробуйте ещё раз.";
		}
	}
});

byId("locate").addEventListener("click", () => {
	const signal = startRequest("Определяю местоположение…");
	navigator.geolocation.getCurrentPosition(
		({ coords }) => {
			if (signal.aborted) {
				return;
			}
			// Округляем примерно до 1 км, чтобы не хранить точные координаты в адресе.
			navigate({
				name: "Рядом со мной",
				lat: Number(coords.latitude.toFixed(2)),
				lon: Number(coords.longitude.toFixed(2)),
			});
		},
		() => {
			if (!signal.aborted) {
				status.textContent = "Нет доступа к геолокации. Найдите город через поиск.";
			}
		},
		{ timeout: 10_000 },
	);
});

byId("home").addEventListener("click", (event) => {
	event.preventDefault();
	history.pushState(null, "", "/");
	document.title = "Погода";
	void showRoute();
});

// Кнопки «Назад» и «Вперёд» в браузере.
window.addEventListener("popstate", () => void showRoute());

void showRoute();

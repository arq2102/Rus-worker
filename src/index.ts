// API сайта: /api/dashboard отдаёт погоду и курсы валют одним ответом.
// Страницу и скрипты отдаёт раздел assets (см. cloudflare.config.ts).

// Подключаем готовые части из общего файла (им пользуются и браузер, и Worker):
import {
	// список кодов валют, курсы которых показываем;
	CURRENCIES,
	// функцию, которая запрашивает прогноз погоды;
	fetchForecast,
	// функцию, которая делает запрос и разбирает ответ в формате JSON;
	getJson,
	// функцию, которая читает место из параметров адреса;
	placeFromSearch,
	// тип общего ответа: погода и курсы;
	type Dashboard,
	// тип места: название и координаты;
	type Place,
	// тип данных о курсах валют.
	type Rates,
	// Это путь к файлу, из которого берётся всё перечисленное.
} from "../client/weather.ts";

// Место по умолчанию: Москва, её широта (lat) и долгота (lon).
const DEFAULT_PLACE: Place = { name: "Москва", lat: 55.7522, lon: 37.6156 };
// Адрес сервиса курсов. USD в конце: курсы считаются относительно доллара США.
const RATES_URL = "https://open.er-api.com/v6/latest/USD";

// Описываем, какие поля из ответа сервиса курсов нам нужны.
interface RatesResponse {
	// Итог запроса: при успехе здесь строка "success".
	result: string;
	// Время обновления курсов: число секунд с 1 января 1970 года.
	time_last_update_unix: number;
	// Курсы в виде пар «код валюты: число».
	rates: Record<string, number>;
}

// Cloudflare держит успешные ответы источников в кэше, чтобы реже к ним обращаться.
// Функция готовит настройки запроса. seconds: сколько секунд хранить ответ.
function cached(seconds: number): RequestInit {
	// Собираем настройки в объект.
	const init = {
		// Если ответа нет 8000 миллисекунд (8 секунд), запрос отменяется.
		signal: AbortSignal.timeout(8000),
		// Настройка Cloudflare: успешные ответы (200–299) хранить seconds секунд, а с кодами 300–599: 0 секунд.
		cf: { cacheTtlByStatus: { "200-299": seconds, "300-599": 0 } },
	};
	// Отдаём готовые настройки тому, кто вызвал функцию.
	return init;
}

// Функция получает курсы валют. async позволяет внутри ждать ответ через await.
async function fetchRates(): Promise<Rates> {
	// Запрашиваем курсы и ждём ответ. Кэш действует 3600 секунд (1 час).
	const data = await getJson<RatesResponse>(RATES_URL, cached(3600));
	// Проверяем: сервис ответил, но не сообщил об успехе?
	if (data.result !== "success") {
		// Тогда прерываем функцию с ошибкой.
		throw new Error("Сервис курсов вернул ошибку");
	}
	// Создаём пустой объект, куда сложим только нужные курсы.
	const values: Record<string, number> = {};
	// По очереди перебираем коды нужных валют.
	for (const code of CURRENCIES) {
		// Берём из ответа курс текущей валюты.
		const value = data.rates[code];
		// Проверяем: курса этой валюты в ответе нет?
		if (value === undefined) {
			// Тогда сообщаем об ошибке и указываем код валюты.
			throw new Error(`Нет курса ${code}`);
		}
		// Записываем найденный курс в наш объект.
		values[code] = value;
	}
	// Возвращаем курсы в удобном для сайта виде.
	return {
		// Все курсы указаны за 1 доллар США.
		base: "USD",
		// Переводим секунды в миллисекунды (умножаем на 1000) и получаем дату в виде строки.
		updated: new Date(data.time_last_update_unix * 1000).toISOString(),
		// Добавляем отобранные курсы. Это короткая запись для values: values.
		values,
	};
}

// Функция готовит ответ для /api/dashboard: получает адрес запроса и возвращает HTTP-ответ.
async function dashboard(url: URL): Promise<Response> {
	// Без координат отвечаем по Москве, чтобы адрес можно было просто открыть в браузере.
	// Проверяем, есть ли в адресе хотя бы один из параметров: lat или lon.
	const hasPlace = url.searchParams.has("lat") || url.searchParams.has("lon");
	// Если параметры есть, читаем место из адреса, а если нет, берём Москву.
	const place = hasPlace ? placeFromSearch(url.search) : DEFAULT_PLACE;
	// Если место получить не удалось (null), значит, координаты неверные или неполные.
	if (!place) {
		// Отвечаем кодом 400: запрос составлен неправильно.
		return Response.json({ error: "Неверные координаты" }, { status: 400 });
	}
	// Пробуем получить данные. Если здесь возникнет ошибка, перейдём в catch.
	try {
		// Promise.all: оба запроса уходят одновременно, ждём оба ответа.
		// Если не удался хотя бы один, не удаётся всё.
		// Первый результат попадает в forecast (кэш 10 минут), второй в rates.
		const [forecast, rates] = await Promise.all([fetchForecast(place, cached(600)), fetchRates()]);
		// Отдаём всё одним JSON-ответом. satisfies проверяет, что он подходит под тип Dashboard.
		return Response.json({ forecast, rates } satisfies Dashboard);
		// Сюда попадаем, если в блоке try возникла ошибка.
	} catch (error) {
		// Записываем ошибку в журнал Worker.
		console.error("dashboard:", error);
		// Получаем текст причины. Если это не объект Error, превращаем значение в строку.
		const reason = error instanceof Error ? error.message : String(error);
		// Отвечаем кодом 502: не удалось получить данные от внешнего сервиса.
		return Response.json({ error: "Не удалось получить данные", reason }, { status: 502 });
	}
}

// Главная часть Worker, которую использует Cloudflare.
export default {
	// Эта функция запускается, когда запрос приходит в Worker.
	async fetch(request) {
		// Разбираем адрес запроса на части.
		const url = new URL(request.url);
		// Проверяем: запрошен путь /api/dashboard?
		if (url.pathname === "/api/dashboard") {
			// Тогда возвращаем погоду и курсы валют.
			return dashboard(url);
		}
		// На другие пути, которые дошли до Worker, отвечаем «не найдено» (404).
		return new Response("Not found", { status: 404 });
	},
	// TypeScript проверяет, что объект подходит для обработчика запросов Worker.
} satisfies ExportedHandler;

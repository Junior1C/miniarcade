# 🎮 MiniArcade

[![Vercel](https://img.shields.io/website?url=https%3A%2F%2Fminiarcades.vercel.app%2F&label=Vercel&up_message=live)](https://miniarcades.vercel.app/)
[![Cloudflare Pages](https://img.shields.io/website?url=https%3A%2F%2Fminiarcade.pages.dev%2F&label=Cloudflare%20Pages&up_message=live)](https://miniarcade.pages.dev/)
[![GitHub Pages](https://img.shields.io/website?url=https%3A%2F%2Fjunior1c.github.io%2Fminiarcade%2F&label=GitHub%20Pages&up_message=live)](https://junior1c.github.io/miniarcade/)

Каталог браузерных HTML5-игр. Статика, ноль runtime-зависимостей, один скрипт сборки каталога.

**Live (GitHub — основной дистрибутив, остальные — зеркала из того же репозитория):**
- GitHub Pages (основной): https://junior1c.github.io/miniarcade/
- Cloudflare Pages (зеркало): https://miniarcade.pages.dev/
- Vercel (зеркало): https://miniarcades.vercel.app/

## Структура

```
index.html                 — оболочка каталога (CSP meta, <dialog>-плеер, JSON-LD от build)
stats.html                 — витрина аналитики: карточки, бары по дням/играм/хостам (CSP meta от build)
assets/
  css/main.css             — дизайн-токены + компоненты
  js/
    main.js                — точка входа: состояние, роутинг по hash, рендер
    catalog.js             — загрузка и валидация data/catalog.json
    search.js              — поиск с мемоизированным индексом (тестируется отдельно)
    format.js              — русская плюрализация
    player.js              — <dialog>-плеер, sandbox iframe
    sandbox-tokens.js      — единый allowlist sandbox-токенов (build + player)
    view-transition.js     — same-document View Transitions с фолбэком (main.js)
    stats.js               — beacon аналитики: pv/open/close, без cookies (см. § Аналитика)
    stats-page.js          — витрина статистики: чистые функции + DOM-рендер (тестируется отдельно)
data/catalog.json          — генерируется из games/*/meta.json (коммитится)
data/stats/                — агрегаты аналитики из nightly Action (коммитятся)
functions/api/hit.js       — приёмник beacon на Cloudflare Pages (POST /api/hit)
stats/
  hit.mjs                  — чистая логика приёмника (тестируется отдельно)
  schema.sql               — D1-схема (применяется идемпотентно)
games/
  <id>/
    index.html             — игра (standalone)
    style.css, game.js     — внешние файлы (CSP требует внешних источников)
    thumb.webp             — превью карточки 440px (генерирует npm run thumbs; у мостов нет)
    meta.json              — метаданные: id, title, emoji, description, tags, …
scripts/
  build.mjs                — скан games/*/ → data/catalog.json + sitemap.xml + JSON-LD в index.html + CSP meta в index.html/stats.html (валидация)
  serve.mjs                — локальный сервер с боевыми заголовками
  security-headers.mjs     — единый источник CSP/Permissions-Policy (serve, _headers, vercel.json)
  check-budgets.mjs        — perf-бюджеты размеров (npm run budgets)
tests/                     — node --test, без зависимостей
tests/e2e/                 — Playwright: каталог, поиск, плеер, perf, a11y (npm run test:e2e)
playwright.config.mjs      — конфиг e2e (webServer сам поднимает dev-сервер)
scripts/new-game.mjs       — скелетер игры (npm run new)
scripts/smoke.mjs          — проверка живых хостингов (npm run smoke)
scripts/gen-og.mjs         — генератор превью assets/og.png (npm run og)
scripts/gen-thumbs.mjs     — WebP-превью игр 440px (npm run thumbs; нужен cwebp)
robots.txt                 — индексация + ссылка на sitemap
sitemap.xml                — генерируется build.mjs: корень + stats.html + свои игры (URLы основного хостинга)
assets/og.png              — превью ссылок (og:image)
.githooks/pre-push         — npm run check перед каждым push
.github/workflows/         — deploy-cloudflare (build+test+budgets), e2e (Playwright+budgets), smoke (cron), stats (ночной забор аналитики)
_headers, vercel.json      — security-заголовки для Vercel / Cloudflare
.assetsignore              — что НЕ загружать на Cloudflare (gitignore-синтаксис)
wrangler.jsonc             — Cloudflare Workers Assets (directory: ".")
.nojekyll                  — GH Pages: отключить Jekyll, публиковать файлы как есть
```

## Локальная разработка

Требуется Node.js 20+. Runtime-зависимостей нет. dev-зависимости нужны только для e2e:

```bash
npm ci                      # один раз: ставит @playwright/test
npx playwright install chromium
git config core.hooksPath .githooks   # один раз: pre-push гоняет npm run check
```

```bash
npm run build    # сгенерировать data/catalog.json + sitemap.xml
npm test         # unit-тесты (node --test)
npm run budgets  # perf-бюджеты размеров (catalog, JS, CSS, HTML, og.png)
npm run test:e2e # Playwright: каталог, поиск, плеер, perf, a11y (сам поднимает сервер)
npm run smoke    # проверить все 4 живых хостинга
npm run new -- <id> "Название"  # скелетер новой игры
npm start        # http://localhost:4173 с боевыми security-заголовками
npm run check    # build + test + budgets (запускает pre-push hook)
npm run og       # перегенерировать assets/og.png (если меняется палитра)
```

## Поддержка платформ

Матрица (явная, без недомолвок): последние 2 версии Chrome / Edge / Firefox / Safari
на десктопе + актуальный Chrome Android / Safari iOS. Полифиллы не используются
осознанно: `<dialog>`, `sandbox=opaque-origin`, `CSS grid`, `ES-модули`,
`toLocaleLowerCase('ru')` поддерживаются всей матрицей. Если нужна более широкая
поддержка (например, старые WebView) — это отдельное решение с деградацией,
а не тихая поломка.

Платформа 09/2026 — только Baseline с бесплатной деградацией:

| Технология | Статус | Как используем |
|---|---|---|
| Same-document View Transitions | Baseline 2025 | фильтр/пагинация каталога (`view-transition.js`); без API — синхронный рендер, при `prefers-reduced-motion` — без анимации |
| Invoker Commands (`commandfor`/`command`) | Baseline 2025 | кнопка `✕ Закрыть` закрывает `<dialog>` декларативно; JS-обработчик остаётся фолбэком |
| `autocorrect="off"` | Baseline 08/2026 | поиск игр (рядом с `autocomplete="off"`, `spellcheck="false"`) |
| `content-visibility: auto` | Baseline | пропуск внеэкранных карточек + `contain-intrinsic-size: auto 260px` против CLS |
| Speculation Rules prerender | **не Baseline** (Chromium-only) | осознанно НЕ используем: навигаций между документами нет (hash + iframe), цена CSP/комплексности выше выгоды |
| Cross-document `@view-transition` | Firefox не поддерживает | не применимо: MPA-навигаций нет |

## Производительность и бюджеты

Бюджеты проверяются архитектурой, а не обещаниями (`npm run budgets` в pre-push и CI):

| Артефакт | Max | Зачем |
|---|---|---|
| `data/catalog.json` | 250 КБ (warn 200 КБ) | поиск в памяти, LCP каталога |
| `assets/js/*.js` суммарно | 30 КБ | критический путь каталога |
| `assets/css/main.css` | 20 КБ | один CSS на каталог |
| `index.html` | 35 КБ | оболочка + JSON-LD и frame-src всех игр (на LCP не влияет) |
| `stats.html` | 35 КБ | витрина статистики: та же CSP meta, без JSON-LD |
| `games/*/thumb.webp` | 25 КБ/файл, 600 КБ суммарно | WebP-превью карточек (свои игры; мосты — эмодзи) |
| `assets/og.png` | 100 КБ | превью ссылок |

E2E-дым (`tests/e2e/perf.e2e.mjs`): главная с карточками <8с на CI-раннере,
`fetch catalog.json` <2с, ноль ошибок консоли. Жёсткие миллисекунды не фиксируем —
раннеры шумные; регрессии ловим по байтам + факту загрузки.

Ориентиры Core Web Vitals 2026 (полевые данные CrUX, p75 — то, что ранжирует Google):
LCP ≤ 2.5с, INP ≤ 200мс (с марта 2024 заменил FID), CLS ≤ 0.1. Проект под них
спроектирован: LCP — оболочка без hero-картинки (3.7 КБ HTML + 1 CSS + 1 JS-модуль),
INP — поиск с debounce 120мс и мемоизированным индексом (`getHaystack`), без тяжёлых
обработчиков; CLS — `contain-intrinsic-size` у карточек, фиксированные размеры canvas,
`about:blank` при закрытии плеера. Лабораторный Lighthouse — только диагностика,
зачёт — по полю.

SEO без цены рантайма: `npm run build` вшивает в `index.html` JSON-LD
(`ItemList` из `VideoGame`, детерминировано из `meta.json`, пересборка идемпотентна;
`application/ld+json` — data-блок, CSP его не режет).

## Как добавить игру (рассчитано на сотни)

1. Скелетер: `npm run new -- moya-igra "Моя игра"` — создаст папку из образца (CSP meta, IIFE-каркас, валидный meta.json) и пересоберёт каталог. Либо создайте папку вручную — build валидирует:
   ```
   games/moya-igra/
     index.html   — standalone, CSP meta уже нужен (см. образец)
     style.css    — внешний файл (inline style-атрибуты блокирует CSP)
     game.js      — классический скрипт в IIFE (модули не работают в sandbox)
     meta.json
   ```
2. Заполните `meta.json`:
   ```json
   {
     "id": "moya-igra",
     "title": "Моя игра",
     "emoji": "🚀",
     "description": "Что делает игра и чем интересна.",
     "tags": ["аркада"],
     "controls": "WASD",
     "sandbox": ["allow-pointer-lock"],
     "order": 10
   }
   ```
   Допустимые ключи строго проверяются (`build` упадёт на опечатке).
   `sandbox` — только токены из белого списка; по умолчанию игре выдаётся `allow-scripts`.
   `order` — необязательный вес сортировки (по умолчанию 0), далее сортировка по названию.
3. `npm run check` (build + test + budgets) — каталог, sitemap и JSON-LD пересоберутся.
   Превью карточки: `npm run thumbs` (нужен cwebp; инкрементально, только изменённые игры).
   После правок визуала игры превью перегенерируйте и коммитьте вместе с игрой.
4. Коммит и push в `main` — GitHub (основной дистрибутив) обновится первым, остальные хостинги синхронизируются сами. `index.html` с JSON-LD коммитится вместе с игрой — build детерминирован.

Правила для игр (проверяются архитектурой, не ревью):

- iframe работает в sandbox с **opaque origin**: нельзя `localStorage`, куки, обращения к `parent`, ES-модули (`import`). Только классические скрипты и стили из своих файлов. Рекорды — только на сессию (in-memory) или ретрансляция в портал.
- игра не должна иметь сетевых запросов — CSP `default-src 'none'` это блокирует. Звук — только синтезированный WebAudio без файлов (ленивый `AudioContext` по первому жесту, весь SFX в `try/catch`).
- фокус-стили (`:focus-visible`), `<output>` / роли `role="status"` для вывода счёта, без `alert()`.
- `e.code` вместо `e.key` для клавиш (раскладка/Caps Lock не ломают управление). Пробел: только `keydown` + `preventDefault` — инкремент на Enter удвоил бы очки с нативным кликом сфокусированной кнопки.
- тач: `touch-action: manipulation` на кнопках (нет 300мс зуму), `touch-action: none` на canvas со свайпами; описание в `meta.json` обязано совпадать с реальным управлением и механикой (счётчики, которые обещаны, — считать).
- анимации за `prefers-reduced-motion`-гардом; пауза по `visibilitychange`, если игра реального времени.

Доступность каталога покрыта e2e-дымом без внешних зависимостей
(`tests/e2e/a11y.e2e.mjs`): skip-link, именованный поиск, живой `role=status`,
ссылки-карточки, `aria-hidden` у эмодзи, модальный `<dialog>` с Esc и сбросом
`iframe → about:blank`. Полный аудит — вручную через axe DevTools / Lighthouse
перед крупными релизами.

## Мосты к внешним играм (код не копируем)

Сайт устроен как распределённая система: каталог един (GitHub Pages — основа,
Cloudflare/Vercel — зеркала из того же коммита), а сами игры живут где угодно —
свои в `games/`, чужие на GitHub Pages авторов. Каталог умеет ссылаться на
бесплатные HTML-игры с GitHub, не вендоря их код: папка `games/<id>/` содержит
только `meta.json` с полями `url` + `author` + `license` (+ `repo`, если есть).
Плеер открывает внешний URL в том же sandbox (`allow-scripts`
без `allow-same-origin`), referrer режется до `no-referrer`. Карточка моста
отмечена угловой ленточкой-перевязью сбоку без текста (декоративна,
`aria-hidden`; смысл дублирует текстовая строка) плюс бейдж `↗ GitHub`,
автор и лицензия; в плеере — ссылка «исходник ↗» на репозиторий, если он указан.

Политика отбора: только встраиваемые игры (без `X-Frame-Options` /
`frame-ancestors`-запрета) из GitHub-репозиториев со свободной лицензией —
ученические, песочницы, рабочие. Сайты, запрещающие встраивание (вроде Poki,
Chess.com, TETR.IO), и проприетарные free-to-play без репозитория в каталог
не берём: это были бы не встроенные игры, а уводы наружу. Чужие URL никогда
не попадают в `sitemap.xml`.

Правила моста (проверяются архитектурой, не ревью):

- лицензия свободная и проверенная (MIT/BSD/Unlicense — спокойно; copyleft вроде
  GPL-3.0 — только ссылкой с атрибуцией, код к нам не едет);
- перед добавлением руками проверяем: страница отдаёт 200, нет `X-Frame-Options` /
  `frame-ancestors`-запрета на встраивание, игра запускается;
- origin обязан входить в `FRAME_SRC_ORIGINS` (`scripts/security-headers.mjs`) —
  единый источник для CSP (`_headers`, `vercel.json`, `<meta>` в `index.html`)
  и для валидации `build.mjs`; тесты валят оба перекоса (мост без origin,
  origin без моста);
- чужие URL не попадают в `sitemap.xml`, живые проверки `smoke.mjs` их не трогают:
  аптайм третьих сторон — не наша ответственность; в e2e мост покрыт стабом
  (`page.route`), а не живой сетью. Зато `smoke.mjs` проверяет, что зеркала
  отдают CSP с `frame-src` мостов — иначе каталог един, а игры на нём молчат.

## Стенд QA-ботов

Четыре скрипта без зависимостей — ловят то, что не видят unit/e2e: нарушение контрактов игр, битые внутренние ссылки, секреты в коде, протухшие мосты. FAIL валит `npm run qa` (а значит pre-push и CI), WARN только шумит.

| Бот | Что ловит | FAIL | WARN |
|---|---|---|---|
| `qa-games` | Свои игры: CSP meta, инлайн `<script>/<style>/on*`, сеть (`fetch`/WS…), storage (бросает в sandbox), `alert`, ES-модули, `innerHTML`, `e.key` вместо `e.code`, `controls` в meta | нарушение контракта | realtime-цикл без `visibilitychange`, нет `thumb.webp` |
| `qa-links` | `catalog.json → файлы`, страницы → ассеты, `sitemap → файлы` (чужие URL — FAIL), `robots.txt`, `og.png`/`favicon` | битая внутренняя ссылка | — |
| `qa-repo` | Сигнатуры секретов, смешанные окончания строк, висячие пробелы, вес игр и `data/stats` | секреты, mixed-EOL, хвосты | CRLF-история, игра >100 КБ |
| `qa-bridges` | Живость мостов: HTTP-статус, `X-Frame-Options`/`frame-ancestors`-запреты | только с `--strict` | мёртвый/закрытый мост |

```bash
npm run qa          # все локальные боты (входит в npm run check, pre-push и CI)
npm run qa:fix      # безопасный автофикс: только висячие пробелы
npm run qa:bridges  # живой обход 124 мостов (сеть; в CI — еженедельный cron qa-bridges.yml, report-only)
```

Исключения документируются кодом, а не молчанием: `hangman` вправе использовать `e.key` (буквенный ввод). Комментарии-пояснения боты режут перед сканом, оправдания в коде их не обманывают.

## Деплой

**GitHub — источник истины**: репозиторий + GitHub Pages (основной дистрибутив). Остальные хостинги — зеркала: тот же push синхронизирует их git-интеграциями. CI на каждый push: build + unit-тесты (Actions), e2e (Playwright); ежедневный cron — smoke-проверка живых сайтов (`scripts/smoke.mjs`: 200, маркеры контента, CSP).

## Аналитика

Сквозной учёт визитов и игр со всех зеркал: каталог шлёт beacon на
`POST https://miniarcade.pages.dev/api/hit` (Pages Function + D1),
ночной Action (`stats.yml`) забирает агрегаты и коммитит их в
`data/stats/daily.json` + `data/stats/totals.json`.

### Где смотреть графики и цифры

| Что | Где |
|---|---|
| 📊 Графики (витрина) | `/stats.html` на любом зеркале: карточки итого, визиты по дням, топ игр, разбивка по хостингам. Полоски — DOM-бары через `data-v` (CSP-safe, доступны скринридерам); без данных страница честно показывает пустое состояние |
| Суммированные данные (навсегда) | `data/stats/daily.json` (по дням) и `data/stats/totals.json` (итоги) в репозитории — обновляет ночной Action; до первого забора лежат пустые плейсхолдеры, витрина честно показывает «данных пока нет» |
| Сырые события (120 дней) | Cloudflare dashboard → D1 → `miniarcade_stats` → таблица `events` (SQL вручную) |

События:

| Событие | Когда | Поля |
|---|---|---|
| `pv` | загрузка каталога | host |
| `open` | открыт плеер | host, game |
| `close` | закрыт плеер | host, game, secs (секунды игры) |

Хостинг определяется по `location.hostname` — так видно, с какого зеркала
играют. Личностей нет и не будет: без cookies, storage и отпечатков, IP
не хранится вообще, реферер режется до hostname, страна — только код
из заголовка CF. Уважаем DNT (и клиентом, и сервером), ботов и headless
режем, свои e2e в статистику не попадают (localhost молчит без `?stats=1`).
Сырьё живёт 120 дней, дальше — только агрегаты в git.

Разовая настройка (без неё beacon тихо no-op, сайт работает как раньше):

1. `npx wrangler d1 create miniarcade_stats` — создать базу;
2. в dashboard Cloudflare Pages-проекта привязать D1 как `STATS_DB`
   (Settings → Functions → D1 database bindings) — иначе `/api/hit`
   отвечает 503, что тоже тихо;
3. проверить: `curl -X POST https://miniarcade.pages.dev/api/hit -d '{"v":1,"event":"pv","host":"test"}'`
   → ждём 204;
4. секреты `CLOUDFLARE_API_TOKEN` (+ `CLOUDFLARE_ACCOUNT_ID`) уже
   используются деплоем — Action статистики переиспользует их; без секрета
   шаг вежливо пропускается.

Если зеркало Cloudflare работает через Workers Assets, а не Pages, —
`functions/` игнорируется: тогда тот же `stats/hit.mjs` переносится
в worker-роут (код чистый, без привязки к Pages).| Хостинг | Механизм | Заголовки |
|---|---|---|
| Cloudflare Pages | Git-интеграция CF (автодеплой из репо); Actions: build + test, шаг wrangler — при наличии секрета `CLOUDFLARE_API_TOKEN` | `_headers` |
| Vercel | git-integration | `vercel.json` |
| GitHub Pages | git-integration | только CSP `<meta>` (Pages не умеет custom headers) |

`data/catalog.json` закоммичен, поэтому хостинги без build-шага работают сразу. После изменения игр перегенерируйте его (`npm run build`) и коммитьте вместе с игрой — Actions пересобирает и тестирует каталог на каждый push (deploy через wrangler включится автоматически, как только в Secrets репозитория появится `CLOUDFLARE_API_TOKEN`).

## Безопасность (слой защиты)

1. **CSP** — `default-src 'none'` везде: каталог и игры грузят только свои файлы с того же origin; игры физически не могут отдать данные наружу. Дублируется в `<meta>` (`index.html` и `stats.html` — ставит `build.mjs` из единого источника; без `frame-ancestors` — спека его в `<meta>` игнорирует, только шумит в консоль) и в `_headers`/`vercel.json` (остальные, там `frame-ancestors` есть и работает). Единый источник — `scripts/security-headers.mjs`, рассинхрон ловит `tests/headers.test.mjs`.
2. **Заголовки**: `nosniff`, `X-Frame-Options: SAMEORIGIN` + `frame-ancestors 'self'` (каталог нельзя встроить чужому сайту), `Cross-Origin-Opener-Policy: same-origin` (у каталога нет popup/OAuth-флоу, плеер — `<dialog>`), `Referrer-Policy`, `Permissions-Policy` (камера/микрофон/геолокация/payment/usb выключены). `CORP: same-origin` осознанно НЕ ставим — мог бы заблокировать iframe игр в sandbox с opaque origin на части движков.
3. **Sandbox iframe** — `allow-scripts` без `allow-same-origin`: игры изолированы в opaque origin и не могут трогать каталог, куки и storage. Дополнительные capability только по белому списку в `meta.json`. Единый allowlist — `assets/js/sandbox-tokens.js` (используют и `build.mjs`, и `player.js`); опасные `allow-same-origin/top-navigation/forms` запрещены тестом.
4. **Ввод** — поиск и данные каталога вставляются только через `textContent`/`createElement` (не `innerHTML`), поэтому XSS через данные невозможен.
5. **Валидация каталога** — `scripts/build.mjs` отклоняет неизвестные ключи, чужие sandbox-токены, рассинхрон id/папки.
6. **Плеер** — нативный `<dialog>`: фокус-трап, Esc и возврат фокуса — бесплатно и по спеке; `src` сбрасывается в `about:blank` при закрытии.
7. **Приватность** — `no-referrer` внутри игр, `strict-origin-when-cross-origin` на каталоге; account_id лежит только в `.wrangler/` (в `.gitignore`).

Что не покрыто (осознанные компромиссы): GH Pages не даёт задать security-заголовки — там работает только CSP в `<meta>` (без `frame-ancestors`, без COOP); `HSTS` целиком отдан хостингам. Service Worker для офлайна не вводим: цена (скоуп на GH Pages, инвалидация кэша, конфликт с `default-src 'none'`) выше выгоды для каталога из трёх игр — пересмотреть при x100.

## Масштабирование

- **x100 (сотни игр)** — одна игра = одна папка; `catalog.json` на 1000 игр ≈ 150–200 КБ, поиск в памяти по мемоизированному индексу, пагинация по 24 карточки (`PAGE_SIZE` в `main.js`), `content-visibility` срезает стоимость отрисовки. Конфликтов merge на уровне общих файлов нет: правится только своя папка.
- **x1000** — тот же предел, плюс: при >~3000 игр поднять `PAGE_SIZE`, при росте файла — генерировать `catalog.json` с `gzip`/brotli на хостинге (CF/Vercel делают это сами).
- **За пределами статики** — если каталог перестанет помещаться в память браузера или понадобятся рейтинги/аккаунты: вынести поиск на Cloudflare Worker + KV, карточки рендерить страницами. Код игр при этом не меняется — контракт `meta.json` стабилен.

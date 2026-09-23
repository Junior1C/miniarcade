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
index.html                 — оболочка каталога (CSP meta, <dialog>-плеер)
assets/
  css/main.css             — дизайн-токены + компоненты
  js/
    main.js                — точка входа: состояние, роутинг по hash, рендер
    catalog.js             — загрузка и валидация data/catalog.json
    search.js              — чистые функции поиска (тестируются отдельно)
    format.js              — русская плюрализация
    player.js              — <dialog>-плеер, sandbox iframe
    sandbox-tokens.js      — единый allowlist sandbox-токенов (build + player)
data/catalog.json          — генерируется из games/*/meta.json (коммитится)
games/
  <id>/
    index.html             — игра (standalone)
    style.css, game.js     — внешние файлы (CSP требует внешних источников)
    meta.json              — метаданные: id, title, emoji, description, tags, …
scripts/
  build.mjs                — скан games/*/ → data/catalog.json + sitemap.xml (валидация)
  serve.mjs                — локальный сервер с боевыми заголовками
  security-headers.mjs     — единый источник CSP/Permissions-Policy (serve, _headers, vercel.json)
  check-budgets.mjs        — perf-бюджеты размеров (npm run budgets)
tests/                     — node --test, без зависимостей
tests/e2e/                 — Playwright: каталог, поиск, плеер, perf, a11y (npm run test:e2e)
playwright.config.mjs      — конфиг e2e (webServer сам поднимает dev-сервер)
scripts/new-game.mjs       — скелетер игры (npm run new)
scripts/smoke.mjs          — проверка живых хостингов (npm run smoke)
scripts/gen-og.mjs         — генератор превью assets/og.png (npm run og)
robots.txt                 — индексация + ссылка на sitemap
sitemap.xml                — генерируется build.mjs (URLы основного хостинга)
assets/og.png              — превью ссылок (og:image)
.githooks/pre-push         — npm run check перед каждым push
.github/workflows/         — deploy-cloudflare (build+test+budgets), e2e (Playwright+budgets), smoke (cron)
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

## Производительность и бюджеты

Бюджеты проверяются архитектурой, а не обещаниями (`npm run budgets` в pre-push и CI):

| Артефакт | Max | Зачем |
|---|---|---|
| `data/catalog.json` | 250 КБ (warn 200 КБ) | поиск в памяти, LCP каталога |
| `assets/js/*.js` суммарно | 30 КБ | критический путь каталога |
| `assets/css/main.css` | 20 КБ | один CSS на каталог |
| `index.html` | 15 КБ | оболочка без игр |
| `assets/og.png` | 100 КБ | превью ссылок |

E2E-дым (`tests/e2e/perf.e2e.mjs`): главная с карточками <8с на CI-раннере,
`fetch catalog.json` <2с, ноль ошибок консоли. Жёсткие миллисекунды не фиксируем —
раннеры шумные; регрессии ловим по байтам + факту загрузки.

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
3. `npm run build && npm test` — каталог и тесты пересоберутся.
4. Коммит и push в `main` — GitHub (основной дистрибутив) обновится первым, остальные хостинги синхронизируются сами.

Правила для игр (проверяются архитектурой, не ревью):

- iframe работает в sandbox с **opaque origin**: нельзя `localStorage`, куки, обращения к `parent`, ES-модули (`import`). Только классические скрипты и стили из своих файлов.
- игра не должна иметь сетевых запросов — CSP `default-src 'none'` это блокирует.
- фокус-стили (`:focus-visible`), роли `role="status"` для вывода счёта, без `alert()`.
- `e.code` вместо `e.key` для клавиш (раскладка/Caps Lock не ломают управление).

Доступность каталога покрыта e2e-дымом без внешних зависимостей
(`tests/e2e/a11y.e2e.mjs`): skip-link, именованный поиск, живой `role=status`,
ссылки-карточки, `aria-hidden` у эмодзи, модальный `<dialog>` с Esc и сбросом
`iframe → about:blank`. Полный аудит — вручную через axe DevTools / Lighthouse
перед крупными релизами.

## Деплой

**GitHub — источник истины**: репозиторий + GitHub Pages (основной дистрибутив). Остальные хостинги — зеркала: тот же push синхронизирует их git-интеграциями. CI на каждый push: build + unit-тесты (Actions), e2e (Playwright); ежедневный cron — smoke-проверка живых сайтов (`scripts/smoke.mjs`: 200, маркеры контента, CSP).

| Хостинг | Механизм | Заголовки |
|---|---|---|
| Cloudflare Pages | Git-интеграция CF (автодеплой из репо); Actions: build + test, шаг wrangler — при наличии секрета `CLOUDFLARE_API_TOKEN` | `_headers` |
| Vercel | git-integration | `vercel.json` |
| GitHub Pages | git-integration | только CSP `<meta>` (Pages не умеет custom headers) |

`data/catalog.json` закоммичен, поэтому хостинги без build-шага работают сразу. После изменения игр перегенерируйте его (`npm run build`) и коммитьте вместе с игрой — Actions пересобирает и тестирует каталог на каждый push (deploy через wrangler включится автоматически, как только в Secrets репозитория появится `CLOUDFLARE_API_TOKEN`).

## Безопасность (слой защиты)

1. **CSP** — `default-src 'none'` везде: каталог и игры грузят только свои файлы с того же origin; игры физически не могут отдать данные наружу. Дублируется в `<meta>` (GitHub Pages) и в `_headers`/`vercel.json` (остальные). Единый источник — `scripts/security-headers.mjs`, рассинхрон ловит `tests/headers.test.mjs`.
2. **Заголовки**: `nosniff`, `X-Frame-Options: SAMEORIGIN` + `frame-ancestors 'self'` (каталог нельзя встроить чужому сайту), `Referrer-Policy`, `Permissions-Policy` (камера/микрофон/геолокация/payment/usb выключены).
3. **Sandbox iframe** — `allow-scripts` без `allow-same-origin`: игры изолированы в opaque origin и не могут трогать каталог, куки и storage. Дополнительные capability только по белому списку в `meta.json`. Единый allowlist — `assets/js/sandbox-tokens.js` (используют и `build.mjs`, и `player.js`); опасные `allow-same-origin/top-navigation/forms` запрещены тестом.
4. **Ввод** — поиск и данные каталога вставляются только через `textContent`/`createElement` (не `innerHTML`), поэтому XSS через данные невозможен.
5. **Валидация каталога** — `scripts/build.mjs` отклоняет неизвестные ключи, чужие sandbox-токены, рассинхрон id/папки.
6. **Плеер** — нативный `<dialog>`: фокус-трап, Esc и возврат фокуса — бесплатно и по спеке; `src` сбрасывается в `about:blank` при закрытии.
7. **Приватность** — `no-referrer` внутри игр, `strict-origin-when-cross-origin` на каталоге; account_id лежит только в `.wrangler/` (в `.gitignore`).

Что не покрыто (осознанные компромиссы): GH Pages не даёт задать security-заголовки — там работает только CSP в `<meta>` (без `frame-ancestors`); `HSTS` целиком отдан хостингам.

## Масштабирование

- **x100 (сотни игр)** — одна игра = одна папка; `catalog.json` на 1000 игр ≈ 150–200 КБ, поиск в памяти, пагинация по 24 карточки (`PAGE_SIZE` в `main.js`). Конфликтов merge на уровне общих файлов нет: правится только своя папка.
- **x1000** — тот же предел, плюс: при >~3000 игр поднять `PAGE_SIZE`, при росте файла — генерировать `catalog.json` с `gzip`/brotli на хостинге (CF/Vercel делают это сами).
- **За пределами статики** — если каталог перестанет помещаться в память браузера или понадобятся рейтинги/аккаунты: вынести поиск на Cloudflare Worker + KV, карточки рендерить страницами. Код игр при этом не меняется — контракт `meta.json` стабилен.

# 🎮 MiniArcade

[![Netlify](https://img.shields.io/website?url=https%3A%2F%2Fminiarcades.netlify.app%2F&label=Netlify&up_message=live)](https://miniarcades.netlify.app/)
[![Vercel](https://img.shields.io/website?url=https%3A%2F%2Fminiarcades.vercel.app%2F&label=Vercel&up_message=live)](https://miniarcades.vercel.app/)
[![Cloudflare Pages](https://img.shields.io/website?url=https%3A%2F%2Fminiarcade.pages.dev%2F&label=Cloudflare%20Pages&up_message=live)](https://miniarcade.pages.dev/)
[![GitHub Pages](https://img.shields.io/website?url=https%3A%2F%2Fjunior1c.github.io%2Fminiarcade%2F&label=GitHub%20Pages&up_message=live)](https://junior1c.github.io/miniarcade/)

Каталог браузерных HTML5-игр. Статика, ноль runtime-зависимостей, один скрипт сборки каталога.

**Live:**
- Cloudflare Pages: https://miniarcade.pages.dev/
- Vercel: https://miniarcades.vercel.app/
- Netlify: https://miniarcades.netlify.app/
- GitHub Pages: https://junior1c.github.io/miniarcade/

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
data/catalog.json          — генерируется из games/*/meta.json (коммитится)
games/
  <id>/
    index.html             — игра (standalone)
    style.css, game.js     — внешние файлы (CSP требует внешних источников)
    meta.json              — метаданные: id, title, emoji, description, tags, …
scripts/
  build.mjs                — скан games/*/ → data/catalog.json (валидация)
  package.mjs              — dist/*.zip для itch.io и Netlify Drop
  serve.mjs                — локальный сервер с боевыми заголовками
tests/                     — node --test, без зависимостей
_headers, vercel.json      — security-заголовки для Netlify / Vercel / Cloudflare
.assetsignore              — что НЕ загружать на Cloudflare (gitignore-синтаксис)
wrangler.jsonc             — Cloudflare Workers Assets (directory: ".")
.nojekyll                  — GH Pages: отключить Jekyll, публиковать файлы как есть
```

## Локальная разработка

Требуется Node.js 20+. Зависимости не нужны (`npm install` можно не выполнять).

```bash
npm run build    # сгенерировать data/catalog.json из games/*/
npm test         # unit-тесты (node --test)
npm start        # http://localhost:4173 с боевыми security-заголовками
npm run package  # dist/miniarcade-netlify.zip + dist/<id>-itch.zip
npm run check    # build + test
```

## Как добавить игру (рассчитано на сотни)

1. Создайте папку `games/<id>/` (id — kebab-case, латиница):
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
4. Коммит в `main` — все четыре хостинга задеплоят сами.

Правила для игр (проверяются архитектурой, не ревью):

- iframe работает в sandbox с **opaque origin**: нельзя `localStorage`, куки, обращения к `parent`, ES-модули (`import`). Только классические скрипты и стили из своих файлов.
- игра не должна иметь сетевых запросов — CSP `default-src 'none'` это блокирует.
- фокус-стили (`:focus-visible`), роли `role="status"` для вывода счёта, без `alert()`.
- `e.code` вместо `e.key` для клавиш (раскладка/Caps Lock не ломают управление).

## Деплой

| Хостинг | Механизм | Заголовки |
|---|---|---|
| Cloudflare Pages | Git-интеграция CF (автодеплой из репо); Actions: build + test, шаг wrangler — при наличии секрета `CLOUDFLARE_API_TOKEN` | `_headers` |
| Netlify | git-integration или Drop `dist/miniarcade-netlify.zip` | `_headers` |
| Vercel | git-integration | `vercel.json` |
| GitHub Pages | git-integration | только CSP `<meta>` (Pages не умеет custom headers) |
| itch.io | `dist/<id>-itch.zip` для каждой игры | — |

`data/catalog.json` закоммичен, поэтому хостинги без build-шага работают сразу. После изменения игр перегенерируйте его (`npm run build`) и коммитьте вместе с игрой — Actions пересобирает и тестирует каталог на каждый push (deploy через wrangler включится автоматически, как только в Secrets репозитория появится `CLOUDFLARE_API_TOKEN`).

## Безопасность (слой защиты)

1. **CSP** — `default-src 'none'` везде: каталог и игры грузят только свои файлы с того же origin; игры физически не могут отдать данные наружу. Дублируется в `<meta>` (GitHub Pages) и в `_headers`/`vercel.json` (остальные).
2. **Заголовки**: `nosniff`, `X-Frame-Options: SAMEORIGIN` + `frame-ancestors 'self'` (каталог нельзя встроить чужому сайту), `Referrer-Policy`, `Permissions-Policy` (камера/микрофон/геолокация выключены).
3. **Sandbox iframe** — `allow-scripts` без `allow-same-origin`: игры изолированы в opaque origin и не могут трогать каталог, куки и storage. Дополнительные capability только по белому списку в `meta.json`.
4. **Ввод** — поиск и данные каталога вставляются только через `textContent`/`createElement` (не `innerHTML`), поэтому XSS через данные невозможен.
5. **Валидация каталога** — `scripts/build.mjs` отклоняет неизвестные ключи, чужие sandbox-токены, рассинхрон id/папки.
6. **Плеер** — нативный `<dialog>`: фокус-трап, Esc и возврат фокуса — бесплатно и по спеке; `src` сбрасывается в `about:blank` при закрытии.
7. **Приватность** — `no-referrer` внутри игр, `strict-origin-when-cross-origin` на каталоге; account_id лежит только в `.wrangler/` (в `.gitignore`).

Что не покрыто (осознанные компромиссы): GH Pages не даёт задать security-заголовки — там работает только CSP в `<meta>` (без `frame-ancestors`); `HSTS` целиком отдан хостингам.

## Масштабирование

- **x100 (сотни игр)** — одна игра = одна папка; `catalog.json` на 1000 игр ≈ 150–200 КБ, поиск в памяти, пагинация по 24 карточки (`PAGE_SIZE` в `main.js`). Конфликтов merge на уровне общих файлов нет: правится только своя папка.
- **x1000** — тот же предел, плюс: при >~3000 игр поднять `PAGE_SIZE`, при росте файла — генерировать `catalog.json` с `gzip`/brotli на хостинге (Netlify/CF/Vercel делают это сами).
- **За пределами статики** — если каталог перестанет помещаться в память браузера или понадобятся рейтинги/аккаунты: вынести поиск на Cloudflare Worker + KV, карточки рендерить страницами. Код игр при этом не меняется — контракт `meta.json` стабилен.

-- D1-схема приёмника аналитики MiniArcade.
-- Применяется идемпотентно: Action выполняет этот файл целиком
-- (`wrangler d1 execute --file`) перед каждым чтением.
-- Храним минимум: никаких IP, UA, cookies. Сырьё — 120 дней,
-- дальше живут только агрегаты в git (data/stats/).
-- visitor — дневной анонимный хеш (SHA-256 день+IP+UA+соль, модель Plausible):
-- сырые IP/UA нигде не хранятся; NULL — хеш неизвестен (dev, старые строки),
-- COUNT(DISTINCT) такие строки игнорирует.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  host TEXT NOT NULL,
  game TEXT NOT NULL DEFAULT '',
  event TEXT NOT NULL,
  secs INTEGER NOT NULL DEFAULT 0,
  country TEXT NOT NULL DEFAULT '',
  ref_host TEXT NOT NULL DEFAULT '',
  visitor TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_day ON events(day);
CREATE INDEX IF NOT EXISTS idx_events_game_day ON events(game, day);

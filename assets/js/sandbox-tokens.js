// Single source of truth для sandbox-токенов iframe-плеера.
//
// Используется в двух местах:
// - scripts/build.mjs — валидация `sandbox` в games/*/meta.json
// - assets/js/player.js — сборка атрибута `sandbox` при открытии игры
//
// Базовый `allow-scripts` сюда НЕ входит: он добавляется плеером всегда
// (см. BASE_SANDBOX в player.js). Здесь только опциональные capability,
// которые автор игры может запросить через meta.json.
//
// Запрещены осознанно: allow-same-origin (ломает opaque origin),
// allow-top-navigation / allow-top-navigation-by-user-activation
// (игра не должна уводить каталог), allow-forms (формы не нужны,
// form-action и так 'none' в CSP).
export const SANDBOX_TOKENS = [
  'allow-downloads',
  'allow-fullscreen',
  'allow-modals',
  'allow-pointer-lock',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
];

// Прогрессивное улучшение рендера через Same-Document View Transitions
// (Baseline 2025: Chrome/Edge 111+, Firefox 133+, Safari 18+).
//
// Использование: оборачивать DOM-мутацию каталога (фильтр/пагинация).
// - Нет API или `prefers-reduced-motion` → синхронный update, ноль эффектов.
// - Браузер без поддержки игнорирует ветку — деградация бесплатная.
// Cross-document (`@view-transition`) здесь не применяется: у каталога нет
// навигаций между документами (только hash + <dialog>), пререндер не нужен.
export function shouldUseViewTransitions({ hasAPI = false, prefersReducedMotion = false } = {}) {
  return hasAPI === true && prefersReducedMotion === false;
}

export function renderWithTransition(doc, update) {
  const scope = doc ?? (typeof document !== 'undefined' ? document : null);
  if (!scope || typeof update !== 'function') return null;
  let prefersReducedMotion = false;
  try {
    prefersReducedMotion =
      scope.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  } catch {
    prefersReducedMotion = false;
  }
  if (
    shouldUseViewTransitions({
      hasAPI: typeof scope.startViewTransition === 'function',
      prefersReducedMotion,
    })
  ) {
    try {
      return scope.startViewTransition(() => {
        update();
      });
    } catch {
      update();
      return null;
    }
  }
  update();
  return null;
}

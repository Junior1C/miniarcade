// Same-Document View Transitions (Baseline 2025) для рендера каталога.
// Нет API или prefers-reduced-motion → синхронно, деградация бесплатная.
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
      const transition = scope.startViewTransition(() => {
        update();
      });
      // Перекрытие штатно (второй рендер, быстрые клики): глушим reject
      // обоих промисов, иначе AbortError роняет pageerror в консоль.
      for (const key of ['ready', 'finished']) {
        if (transition && typeof transition[key]?.catch === 'function') {
          transition[key].catch(() => {});
        }
      }
      return transition;
    } catch {
      update();
      return null;
    }
  }
  update();
  return null;
}

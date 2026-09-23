import test from 'node:test';
import assert from 'node:assert/strict';

import { renderWithTransition, shouldUseViewTransitions } from '../assets/js/view-transition.js';

test('transitions run only with API support and without reduced motion', () => {
  assert.equal(shouldUseViewTransitions({ hasAPI: true, prefersReducedMotion: false }), true);
  assert.equal(shouldUseViewTransitions({ hasAPI: false, prefersReducedMotion: false }), false);
  assert.equal(shouldUseViewTransitions({ hasAPI: true, prefersReducedMotion: true }), false);
  assert.equal(shouldUseViewTransitions(), false);
});

test('renderWithTransition falls back to sync update without API', () => {
  let calls = 0;
  const result = renderWithTransition({}, () => {
    calls += 1;
  });
  assert.equal(calls, 1);
  assert.equal(result, null);
});

test('renderWithTransition respects prefers-reduced-motion even with API', () => {
  let started = 0;
  let updated = 0;
  const doc = {
    defaultView: { matchMedia: () => ({ matches: true }) },
    startViewTransition: () => {
      started += 1;
      return {};
    },
  };
  renderWithTransition(doc, () => {
    updated += 1;
  });
  assert.equal(started, 0);
  assert.equal(updated, 1);
});

test('renderWithTransition uses the API when available', () => {
  let updated = 0;
  const transition = { finished: Promise.resolve() };
  const doc = {
    defaultView: { matchMedia: () => ({ matches: false }) },
    startViewTransition: (update) => {
      update();
      updated += 1;
      return transition;
    },
  };
  const result = renderWithTransition(doc, () => {});
  assert.equal(updated, 1);
  assert.equal(result, transition);
});

test('broken matchMedia never breaks rendering', () => {
  let updated = 0;
  const doc = {
    defaultView: {
      matchMedia: () => {
        throw new Error('no media');
      },
    },
  };
  renderWithTransition(doc, () => {
    updated += 1;
  });
  assert.equal(updated, 1);
});

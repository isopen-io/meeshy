import { describe, expect, test } from 'bun:test';

import { resolveStoryPlaybackHold } from './playback-hold';

/* Décision du porteur, 2026-10-09 (#9821) : la story ne se FIGE que sur la
   pause demandée (appui long, double tap, espace) ou une cause qui la retire
   de l'écran ; commentaires, options, langues, feuilles et composition la
   font JOUER EN BOUCLE. */
describe('resolveStoryPlaybackHold', () => {
  test('rien ne la retient : elle avance', () => {
    expect(resolveStoryPlaybackHold({ paused: false, engaged: false })).toBeNull();
  });

  test('la pause demandée fige la story', () => {
    expect(resolveStoryPlaybackHold({ paused: true, engaged: false })).toBe('pause');
  });

  test('commentaires, options ou composition : elle boucle', () => {
    expect(resolveStoryPlaybackHold({ paused: false, engaged: true })).toBe('loop');
  });

  test('une pause l’emporte sur la boucle', () => {
    expect(resolveStoryPlaybackHold({ paused: true, engaged: true })).toBe('pause');
  });
});

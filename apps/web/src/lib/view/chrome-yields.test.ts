import { describe, expect, test } from 'bun:test';

import { chromeYields, yieldingChrome } from './chrome-yields';

/**
 * #8601 — QUAND ON ÉCRIT, LE CHROME CÈDE LA PLACE. Une feuille de
 * commentaires ou de réponses ouverte sur une story ou un réel laissait
 * l'en-tête (barres, auteur, fermer), le bouton retour, les rails et les
 * décorateurs peints autour d'elle : chaque élément avait SA condition, et
 * l'en-tête de la story ignorait la feuille. UNE loi dit désormais quand le
 * chrome cède, et UNE projection dit comment.
 */
describe('chromeYields — quand le chrome cède', () => {
  test('une feuille ouverte (commentaires, réponse, spectateurs) fait céder le chrome', () => {
    expect(chromeYields({ sheetOpen: true })).toBe(true);
  });

  test('la pause par appui long le fait céder aussi — c’est la même immersion', () => {
    expect(chromeYields({ sheetOpen: false, held: true })).toBe(true);
  });

  test('rien d’ouvert, rien de tenu : le chrome est là', () => {
    expect(chromeYields({ sheetOpen: false })).toBe(false);
    expect(chromeYields({ sheetOpen: false, held: false })).toBe(false);
  });
});

describe('yieldingChrome — comment il cède : en fondu, aux yeux ET au doigt', () => {
  test('masqué : transparent, inerte (ni doigt, ni clavier, ni lecteur d’écran), et marqué pour la mesure', () => {
    const props = yieldingChrome({ hidden: true, reducedMotion: false });
    expect(props.style.opacity).toBe(0);
    expect(props.inert).toBe(true);
    expect(props['data-chrome-yields']).toBe('hidden');
  });

  test('visible : opaque, atteignable', () => {
    const props = yieldingChrome({ hidden: false, reducedMotion: false });
    expect(props.style.opacity).toBe(1);
    expect(props.inert).toBe(false);
    expect(props['data-chrome-yields']).toBe('shown');
  });

  test('le fondu dure le temps d’un regard ; sous `prefers-reduced-motion`, il n’y a pas de fondu', () => {
    expect(yieldingChrome({ hidden: true, reducedMotion: false }).style.transition).toBe('opacity 180ms ease');
    expect(yieldingChrome({ hidden: true, reducedMotion: true }).style.transition).toBe('none');
  });
});

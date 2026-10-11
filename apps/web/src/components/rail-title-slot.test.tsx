import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { RailTitleSlot } from './rail-title-slot';
import type { StoryRailProps } from './story-rail';

/* Le rail n'est monté qu'épinglé : au repos, ses props ne sont jamais lues. */
const UNREAD_RAIL = {} as StoryRailProps;

describe('le grand titre rétrécit plutôt que de se couper (#9221)', () => {
  test('comme `minimumScaleFactor(0.55)` iOS : la taille suit la place et la longueur du titre, de 55 % à 100 % du grand titre', () => {
    const html = renderToStaticMarkup(<RailTitleSlot title="Meeshy Chats" pinned={false} railProps={UNREAD_RAIL} />);
    expect(html).toMatch(/data-title-slot[^>]*container-type:inline-size/);
    expect(html).toContain('--title-chars:12');
    expect(html).toContain(
      'font-size:clamp(calc(var(--ios-text-large-title) * 0.55), calc(100cqi / (var(--title-chars) * 0.6)), var(--ios-text-large-title))',
    );
  });

  /* LA CHASSE ESTIMÉE NE DOIT PAS ÊTRE PLUS ÉTROITE QUE LE GRAS RENDU (#10101).
     À 0,56 em par caractère, la taille calculée pour 162 px de créneau (la
     liste du cadre côte à côte à sa largeur minimale, 20rem) rendait
     « Meeshy Chats » sur 168 px dans Chromium (gras de repli Arial/Liberation,
     0,582 em par caractère mesuré) : « Meeshy Ch… ». La troncature n'est
     qu'un dernier recours ; l'estimation garde donc une marge sur le gras le
     plus large mesuré. */
  test('la chasse estimée couvre le gras le plus large mesuré : le titre rétrécit au lieu de se couper', () => {
    const MEASURED_BOLD_EM_PER_CHAR = 0.582;
    const html = renderToStaticMarkup(<RailTitleSlot title="Meeshy Chats" pinned={false} railProps={UNREAD_RAIL} />);
    const estimate = Number(/var\(--title-chars\) \* ([\d.]+)\)/.exec(html)?.[1]);
    expect(estimate).toBeGreaterThanOrEqual(MEASURED_BOLD_EM_PER_CHAR);
  });
});

import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup as render } from 'react-dom/server';

import {
  UNREAD_BADGE_CORNER,
  UNREAD_BADGE_FLOW,
  UnreadBadge,
  UnreadCornerBadge,
  unreadBadgeText,
} from './unread-badge';

/**
 * **LE PORTILLON VIT DANS L'ATOME** — aucun appelant n'écrit `count > 0`.
 *
 * Si ce portillon s'ouvrait à zéro, chaque rangée LUE afficherait un disque
 * rouge vide ; s'il s'ouvrait sur un négatif — ce qu'un remplacement optimiste
 * peut produire — elle en afficherait un avec « -3 » dedans. C'est le premier
 * test de l'atome iOS (`UnreadCountBadgeTests.test_isVisible_isTrueOnlyAboveZero`)
 * et c'est le premier ici.
 */
describe('le portillon', () => {
  test('rien à zéro, rien en négatif, rien sur NaN', () => {
    expect(unreadBadgeText(0)).toBe('');
    expect(unreadBadgeText(-3)).toBe('');
    expect(unreadBadgeText(Number.NaN)).toBe('');
    expect(render(<UnreadBadge count={0} />)).toBe('');
    expect(render(<UnreadCornerBadge count={0} />)).toBe('');
  });

  test('une pastille dès un', () => {
    expect(unreadBadgeText(1)).toBe('1');
    expect(render(<UnreadBadge count={1} />)).toContain('data-unread="1"');
  });
});

/**
 * **« 99+ », JAMAIS `min(count, 99)`** — le doc-comment d'iOS nomme le défaut
 * évité : « 99 » serait un nombre FAUX présenté comme exact.
 *
 * Et la borne n'est pas cosmétique : sans elle, une conversation à 4 312
 * messages en retard peignait une capsule large d'un tiers de rangée, qui
 * repoussait le nom et le tronquait.
 */
describe('la borne haute', () => {
  test('99 s’écrit 99, 100 s’écrit 99+', () => {
    expect(unreadBadgeText(99)).toBe('99');
    expect(unreadBadgeText(100)).toBe('99+');
    expect(unreadBadgeText(4312)).toBe('99+');
  });

  test('le crochet des gates porte le compte RÉEL, pas le texte affiché', () => {
    const html = render(<UnreadBadge count={4312} />);
    expect(html).toContain('data-unread="4312"');
    expect(html).toContain('99+');
  });
});

/**
 * **LE ROUGE EST SÉMANTIQUE, JAMAIS L'ACCENT DE LA CONVERSATION.**
 *
 * Cette garde vient d'iOS, où elle est écrite noir sur blanc
 * (`UnreadCountBadgeTests.test_theBadgeIsSemanticRed_neverTheConversationAccent`) :
 * « l'accent est une décoration, il ne dit pas *il te reste ceci à lire* ».
 *
 * La v3.1 peignait sa pastille de rangée en `var(--accent)` — donc, sur une
 * conversation turquoise, en turquoise : la seule information d'urgence de
 * l'écran portait la couleur que cette même rangée emploie déjà pour dire
 * « moi ».
 */
describe('le rouge', () => {
  test('les deux poses peignent l’erreur, aucune ne peint l’accent', () => {
    for (const html of [render(<UnreadBadge count={2} />), render(<UnreadCornerBadge count={2} />)]) {
      expect(html).toContain('var(--color-error)');
      expect(html).not.toContain('var(--accent)');
    }
  });
});

/**
 * **LES DEUX POSES DIFFÈRENT, ET C'EST VOULU** : une pastille de COIN empiète
 * sur ce qu'elle annote, elle doit donc être plus petite que celle qui occupe
 * sa propre place dans un flux. Les deux cotes viennent d'iOS
 * (`UnreadCountBadge.minimumSize = 24`, `NotificationBadge.minimumSize = 18`).
 */
describe('les cotes', () => {
  test('le flux plancher à 24, le coin à 18', () => {
    expect(UNREAD_BADGE_FLOW.minimumSize).toBe(24);
    expect(UNREAD_BADGE_CORNER.minimumSize).toBe(18);
    expect(render(<UnreadBadge count={1} />)).toContain('min-width:24px');
    expect(render(<UnreadCornerBadge count={1} />)).toContain('min-width:18px');
  });

  /**
   * La pastille de coin sortait par le HAUT de l'en-tête et s'y faisait
   * tronquer par la marge de sécurité (mesuré à la capture, 390 × 844). Elle
   * rentre : `top` positif, ancrée au coin INTÉRIEUR de la cible.
   */
  test('la pastille de coin ne déborde pas par le haut', () => {
    const html = render(<UnreadCornerBadge count={30} />);
    expect(html).toContain('top:2px');
    expect(html).not.toContain('top:0');
  });
});

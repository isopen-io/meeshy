import { describe, expect, test } from 'bun:test';

import { DAY_PILL_TOP } from '@/lib/reading-mode/metrics';
import { LIST_BOTTOM_BREATH, SCROLL_BUTTON_GAP, threadInsets } from './thread-insets';

/**
 * LES RÉSERVES DU DÉFILEUR DU FIL (#6213).
 *
 * Ce que ces témoins interdisent, et qui a été LIVRÉ : un défileur borné par
 * ses deux voisins de flux — en-tête au-dessus, composeur en dessous — dont
 * les arêtes TRANCHENT le contenu (capture porteur du 2026-09-12 : la
 * dernière ligne du dernier message coupée en deux par la pilule de langue).
 *
 * La loi est celle d'iOS, où la liste court de bord physique à bord physique
 * et où les réserves sont des `contentInset`, jamais des boîtes de flux
 * (`ConversationView.swift:1552-1556, 1873`) :
 *
 *     topInset:    DeviceLayout.safeAreaTop
 *     bottomInset: composerHeight + 16 + DeviceLayout.safeAreaBottom
 */
describe('les réserves du défileur du fil', () => {
  const edges = { bottomEdgeHeight: 96, safeAreaTop: 59, safeAreaBottom: 34 };

  test('la réserve HAUTE est l’encoche SEULE — le contenu transite sous la bande', () => {
    /* `topInset: DeviceLayout.safeAreaTop`, et RIEN de la hauteur de
       l'en-tête : c'est exactement ce qui rend le défilement visible « du
       haut de l'écran au bas de l'écran ». Réserver la bande entière
       rendrait la vue conforme à ce qu'elle était — un couperet, simplement
       déplacé plus bas. */
    expect(threadInsets(edges).top).toBe(59);
  });

  test('la réserve BASSE est le bord bas MESURÉ plus la respiration', () => {
    expect(threadInsets(edges).bottom).toBe(96 + LIST_BOTTOM_BREATH);
  });

  test('la respiration vaut les 16 pt d’iOS — c’est « l’espace vers le bas »', () => {
    expect(LIST_BOTTOM_BREATH).toBe(16);
  });

  test('sans composeur monté (Résumé Vivant), l’encoche basse tient lieu de bord', () => {
    /* Le Résumé ne monte AUCUN composeur (`thread.tsx`, « LE COMPOSEUR NE SE
       MONTE JAMAIS EN RÉSUMÉ ») : la mesure vaut 0 et la réserve tomberait
       SOUS l'indicateur home sans ce plancher. */
    const insets = threadInsets({ ...edges, bottomEdgeHeight: 0 });
    expect(insets.bottom).toBe(34 + LIST_BOTTOM_BREATH);
  });

  test('avant la première mesure, la réserve ne peut pas être négative', () => {
    const insets = threadInsets({ bottomEdgeHeight: Number.NaN, safeAreaTop: Number.NaN, safeAreaBottom: Number.NaN });
    expect(insets.top).toBe(0);
    expect(insets.bottom).toBe(LIST_BOTTOM_BREATH);
  });

  test('une mesure aberrante (négative) ne remonte pas le fil', () => {
    const insets = threadInsets({ bottomEdgeHeight: -240, safeAreaTop: -12, safeAreaBottom: 0 });
    expect(insets.top).toBe(0);
    expect(insets.bottom).toBe(LIST_BOTTOM_BREATH);
  });

  test('le bouton « revenir en bas » se pose au-dessus du composeur, jamais derrière', () => {
    /* Miroir `.padding(.bottom, composerScrollButtonAnchor + MeeshySpacing.sm)`
       (`ConversationView.swift:1957`). Le défileur couvrant désormais TOUTE
       la hauteur, un `bottom-2` laissait ce bouton sous le composeur. */
    expect(threadInsets(edges).scrollButtonBottom).toBe(96 + SCROLL_BUTTON_GAP);
  });

  test('la pilule d’annonce se pose sur le même bord que le bouton', () => {
    expect(threadInsets(edges).noticeBottom).toBe(threadInsets(edges).scrollButtonBottom);
  });

  test('la pilule de JOUR retrouve l’arithmétique iOS ENTIÈRE', () => {
    /* `MessageDayStickyPlacement.topOffset` est mesuré depuis le haut du
       CADRE. Tant que l'enveloppe commençait au bord bas de l'en-tête, la
       v3.1 devait en soustraire la bande (`DAY_PILL_MARGIN`) ; l'enveloppe
       couvrant maintenant l'écran entier, la soustraction n'a plus lieu
       d'être — la divergence disparaît avec la cause. */
    expect(threadInsets(edges).dayPillTop).toBe(59 + DAY_PILL_TOP);
  });
});

import { describe, expect, test } from 'bun:test';

import { loin, near, paintedAt } from './check-media-grid.mjs';

/**
 * UNE SONDE DE PIXELS QUI TOMBE HORS DE L'ÉCRAN FAIT ROUGIR SON TÉMOIN — elle
 * ne tue pas le gate, et elle ne le rend pas menteur non plus (#7048).
 *
 * ## Le défaut gardé ici
 *
 * `dev` est resté ROUGE une nuit sur « Gate états du fil » pour une seule
 * ligne : `paintedAt` passait les coordonnées d'une `boundingBox` à
 * `page.screenshot({ clip })` sans vérifier qu'elles tombaient dans le
 * viewport. Quand le virtualiseur du fil sortait `media-13` de l'écran entre
 * deux mesures (le journal CI l'a mesurée à **y = −297**), Playwright levait
 * « Clipped area is either empty or outside the resulting image ».
 *
 * Cette exception remontait en `uncaughtException` : elle **jetait les 588
 * témoins déjà verts** et déclenchait `pageDiagnostics()`, dont les dizaines
 * de lignes « A bad HTTP response code (404) … fetching the script » — le
 * service worker que ce gate refuse de servir À DESSEIN, présent à l'identique
 * dans les exécutions VERTES — désignaient alors la mauvaise chose. Le premier
 * diagnostic du défaut y a perdu son temps.
 *
 * ## Pourquoi trois témoins et pas un
 *
 * Réparer la cause (défiler vers la rangée avant de la sonder) ne se garde pas
 * en unitaire : c'est une course entre le virtualiseur et la mesure, et l'issue
 * #7048 note qu'elle ne s'est pas reproduite hors CI. Ce qui se garde, et qui
 * vaut pour toute la famille, c'est le SENS DE PANNE — ce que le gate fait
 * quand la sonde échoue quand même. D'où les trois questions, dans l'ordre où
 * elles mordent :
 *
 * 1. la sonde hors écran REND-elle son motif, au lieu de lever ?
 * 2. une règle POSITIVE rougit-elle sur ce motif ?
 * 3. une règle NÉGATIVE rougit-elle aussi ?
 *
 * La troisième est la seule qui ne va pas de soi, et c'est la seule qui
 * comptait : `near()` rendu fail-closed suffit aux règles positives, mais
 * `!near(sondePerdue, INDIGO)` rend **VRAI**. G5 porte exactement cette
 * forme — « la rangée plate arrondit CHAQUE case : le coin intérieur est HORS
 * média » — et aurait donc VERDI PAR ABSENCE DE SUJET, au moment précis où la
 * mesure venait d'échouer. Un correctif qui s'arrête à `near` troque un gate
 * qui explose contre un gate qui MENT : l'explosion, au moins, se voit.
 */

/** Le viewport des gates de peau de ce fichier — `newContext({ viewport })`, 390 × 844. */
const VIEWPORT = { width: 390, height: 844 };

/**
 * Une page qui ne sait faire que deux choses : dire sa taille, et refuser
 * exactement comme Playwright refuse. Le message est celui du vrai moteur,
 * recopié du journal CI — si `paintedAt` laisse passer une coordonnée hors
 * cadre, ce faux la lève à l'identique et le témoin le dit.
 */
const fakePage = (viewport: { width: number; height: number } | null = VIEWPORT) => ({
  viewportSize: () => viewport,
  screenshot: ({ clip }: { clip: { x: number; y: number; width: number; height: number } }) => {
    const dehors =
      clip.x < 0 ||
      clip.y < 0 ||
      clip.x + clip.width > VIEWPORT.width ||
      clip.y + clip.height > VIEWPORT.height;
    if (dehors) throw new Error('page.screenshot: Clipped area is either empty or outside the resulting image');
    return Promise.resolve(Buffer.from(''));
  },
  evaluate: () => Promise.resolve([99, 102, 241]),
});

const INDIGO = [99, 102, 241];

describe('une sonde de pixels hors du viewport', () => {
  test('rend son MOTIF au lieu de lever — les témoins déjà verts survivent', async () => {
    const verdict = await paintedAt(fakePage(), 120, -297, 'G5 — le coin intérieur');

    expect(typeof verdict).toBe('string');
    expect(verdict).toContain('HORS du viewport');
    // La coordonnée FAUTIVE et la taille de l'écran, sans quoi le message ne
    // vaut pas mieux que celui de Playwright qu'il remplace.
    expect(verdict).toContain('(120, -297)');
    expect(verdict).toContain('390×844');
    // Et le NOM du point sondé : trois sondes vivent dans le même bloc G5.
    expect(verdict).toContain('G5 — le coin intérieur');
  });

  test('vaut pour les quatre bords, jamais pour le seul y négatif', async () => {
    const dehors = [
      [-1, 400],
      [120, -1],
      [VIEWPORT.width, 400],
      [120, VIEWPORT.height],
    ] as const;

    for (const [x, y] of dehors) {
      expect(typeof (await paintedAt(fakePage(), x, y, 'sonde'))).toBe('string');
    }
    // Le dernier pixel LÉGITIME de l'écran reste une mesure, pas un refus.
    expect(await paintedAt(fakePage(), VIEWPORT.width - 1, VIEWPORT.height - 1, 'sonde')).toEqual(INDIGO);
  });

  test('fait rougir une règle POSITIVE — `near` ne peut pas lire un motif', () => {
    const perdue = 'G5 — le coin intérieur tombe HORS du viewport : (120, -297) pour 390×844';

    expect(near(perdue, INDIGO)).toBe(false);
    expect(near(INDIGO, INDIGO)).toBe(true);
  });

  test('fait rougir une règle NÉGATIVE — le piège qui aurait verdi', () => {
    const perdue = 'G5 — le coin intérieur tombe HORS du viewport : (120, -297) pour 390×844';

    // CE QUE LA NÉGATION NAÏVE AURAIT RENDU, et pourquoi `loin` existe : sur une
    // sonde perdue, `!near(...)` est VRAI, donc « le coin est hors média »
    // aurait été déclaré SATISFAIT sans qu'aucun pixel ait été lu.
    expect(!near(perdue, INDIGO)).toBe(true);
    expect(loin(perdue, INDIGO)).toBe(false);

    // Sur de vraies mesures, `loin` reste bien la négation attendue.
    expect(loin([255, 255, 255], INDIGO)).toBe(true);
    expect(loin(INDIGO, INDIGO)).toBe(false);
  });
});

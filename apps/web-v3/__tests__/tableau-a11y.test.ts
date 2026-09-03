import { axe } from 'jest-axe';

import { documentDuTableau } from '@/app/connecte/vue';

/**
 * Gate B (§ 9.5) sur le TABLEAU DE BORD — `/` pour un lecteur connecté.
 *
 * POURQUOI ICI, ET PAS SEULEMENT DANS `e2e/visual/v3-a11y.spec.ts`. Le balayage
 * du navigateur lit `app-build-manifest.json`, qui ne porte que les PAGES
 * d'App Router ; le tableau de bord est un GESTIONNAIRE DE ROUTE (`app/route.ts`
 * → `app/connecte/porte.ts`), précisément pour tenir le gate d'UNE requête avant
 * le premier pixel (§ 12.6). Un gate qui ne le voit pas ne le garde pas.
 *
 * Ce que ce témoin ajoute au balayage du navigateur : il tombe en `bun run test`,
 * sans build ni serveur, sur la STRUCTURE — les repères, l'ordre des titres, le
 * nom accessible de chaque lien. Le CONTRASTE, lui, a besoin d'une mise en page
 * et de couleurs calculées : il reste au navigateur, dans les quatre colonnes de
 * thème du § 9.6.
 */

const ETAT = {
  lecteur: {
    id: 'u1',
    prenom: 'Amina',
    nomAffiche: 'Amina Diallo',
    pseudonyme: 'amina',
    systemLanguage: 'fr',
    regionalLanguage: null,
    customDestinationLanguage: null,
      nom: null,
      bio: null,
      email: null,
      telephone: null,
  },
  conversations: [
    {
      id: '68f2a81417a557e8ce4ddfbb',
      identifiant: 'lagos',
      titre: 'Équipe Lagos',
      genre: 'group',
      membres: 12,
      nonLus: 3,
      dernierMessageA: '2026-09-01T12:00:00.000Z',
      apercu: 'On se cale à 15 h pour la revue ?',
      apercuTraductions: null,
      apercuLangueOriginale: 'fr',
      sourdine: false,
      archivee: false,
    },
  ],
  total: 4,
  liens: { genre: 'liste' as const, liens: [{ identifiant: 'lagos-q1', nom: 'Ops', utilisations: 12, conversation: 'c1', actif: true, capacite: null, expireA: null }] },
  maintenant: Date.parse('2026-09-01T12:30:00.000Z'),
};

const graves = async (): Promise<readonly string[]> => {
  const rapport = await axe(document.documentElement);
  return rapport.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id} — ${violation.help}`);
};

const peint = (html: string): void => {
  document.open();
  document.write(html);
  document.close();
};

describe('le tableau de bord face à axe', () => {
  it('ne porte aucune violation grave, garni', async () => {
    peint(documentDuTableau(ETAT));

    expect(await graves()).toEqual([]);
  });

  /**
   * L'état VIDE est un écran à part entière : c'est celui qu'un compte neuf voit
   * en premier, et c'est celui qu'un balayage garni ne visite jamais.
   */
  it('ne porte aucune violation grave, vide', async () => {
    peint(
      documentDuTableau({
        ...ETAT,
        lecteur: null,
        conversations: [],
        total: 0,
        liens: { genre: 'liste', liens: [] },
      }),
    );

    expect(await graves()).toEqual([]);
  });

  it('rougit sur un document dont la structure est fautive', async () => {
    peint('<html><body><div tabindex="0"><img src="x"></div></body></html>');

    expect(await graves()).not.toEqual([]);
  });
});

/**
 * #4857 — le cliquet de dette des refus 401 sans sens nommé.
 *
 * `utils/response.ts:sendUnauthorized` garde désormais un `code` TOUJOURS
 * défini (`AUTH_ERROR_CODES.UNAUTHORIZED` par défaut, jamais `undefined`) —
 * voir `utils/__tests__/response.test.ts` pour la preuve sur le producteur.
 * Ce fichier-ci garde l'AUTRE moitié : combien de sites de production
 * n'ont pas encore été confrontés à la question « ce refus porte-t-il un
 * sens plus précis que le générique ? ». C'est une dette bornée, pas une
 * garde à inventaire vide — le défaut reste un choix légitime pour le sens
 * qu'il nomme.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { join } from 'path';

import { sweepUnauthorizedCallSites } from './unauthorized-code-ratchet';

const SRC_DIR = join(__dirname, '..', '..');
const FIXTURES = join(__dirname, 'fixtures', 'unauthorized-code');

/**
 * Mesuré au moment de #4857 : 128 appels de production ne passaient AUCUN
 * `code` ; ce lot en a nommé 11 (les sens mesurés comme distincts du
 * générique — session invalide, lien magique, session révoquée,
 * identifiants, second facteur). Reste 117. Cette borne ne descend qu'en
 * nommant un site de plus dans `utils/auth-error-codes.ts` — jamais en la
 * relevant pour faire de la place à un nouveau site non classé.
 *
 * 117 → 118 (#3690) : `GET /users/me/referral-code` — refus générique
 * (« Authentification requise »), exactement le même sens que les sites déjà
 * comptés de `contacts-directory.ts`/`devices.ts` (aucune créance JWT). Le
 * défaut reste le choix juste pour ce sens ; relevé plutôt que d'inventer un
 * code spécifique qui ne nommerait rien de plus précis.
 *
 * 118 → 119 (#5547) : `GET /me/engagement` — même sens générique
 * (« Authentication required »), même famille que `me/consents.ts` et
 * `me/get-me.ts` juste au-dessus dans ce même répertoire. Relevé pour la même
 * raison : inventer un code distinct ici ne nommerait rien de plus précis que
 * ce que le défaut porte déjà.
 */
const DETTE_MAXIMALE = 119;

describe('sendUnauthorized — cliquet de dette des sens non nommés', () => {
  it('le nombre de sites qui se reposent sur le défaut ne dépasse pas la dette mesurée', () => {
    const hits = sweepUnauthorizedCallSites(SRC_DIR);
    const sansCodeExplicite = hits.filter((h) => h.explicitCode === null);

    expect(sansCodeExplicite.length).toBeLessThanOrEqual(DETTE_MAXIMALE);
  });

  /**
   * Le balayage lui-même est une AFFIRMATION, et se vérifie comme telle :
   * il doit voir un appel SANS code (même étalé sur plusieurs lignes) et ne
   * jamais se laisser distraire par une citation en commentaire.
   */
  it('le balayage VOIT un appel qui se repose sur le défaut, y compris étalé sur plusieurs lignes', () => {
    const hits = sweepUnauthorizedCallSites(FIXTURES).filter(
      (h) => h.file === 'relies-on-default.ts'
    );

    expect(hits).toHaveLength(2);
    expect(hits.every((h) => h.explicitCode === null)).toBe(true);
  });

  /**
   * Et il lit le `code` explicite, qu'il soit posé via la constante nommée
   * ou via un littéral — les deux formes vivent dans le dépôt.
   */
  it('le balayage nomme le code explicite, via la constante ou le littéral', () => {
    const hits = sweepUnauthorizedCallSites(FIXTURES).filter(
      (h) => h.file === 'names-its-sense.ts'
    );

    expect(hits.map((h) => h.explicitCode).sort()).toEqual(['INVALID_CREDENTIALS', 'SESSION_INVALID']);
  });
});

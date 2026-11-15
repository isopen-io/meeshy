/**
 * Le CLIQUET des BOUCHONS DE SCHÉMA DE RÉPONSE dans les suites du gateway (#4649).
 *
 * ## Pourquoi un cliquet, et pas une interdiction
 *
 * Le dépôt a corrigé SIX fois en deux jours la même classe de défaut : un champ
 * calculé par la passerelle, supprimé en silence par `fast-json-stringify`
 * faute d'être déclaré au schéma de réponse (#4487 §2, #4535, #3736, #4641,
 * #4648, `currentUserConsumption` de #3909). **Les six ont été trouvés en
 * LISANT du code, jamais par un témoin.** #4649 a mesuré pourquoi : 85 suites
 * remplaçaient `errorResponseSchema` par un objet d'une propriété là où le vrai
 * schéma en déclare cinq.
 *
 * > **Un bouchon de schéma n'isole pas une dépendance : il remplace l'objet
 * > TESTÉ.** Pour une route dont le contrat EST le schéma, mocker le schéma
 * > revient à mocker la conclusion.
 *
 * Interdire d'un coup les 111 bouchons restants rendrait le dépôt rouge sans
 * rien apprendre : la mesure de #4649 dit que 84 des 87 suites concernées
 * restent VERTES quand on retire leur bouchon — c'est-à-dire qu'aucune de leurs
 * assertions ne le voyait. Un bouchon inerte est BRUYANT, pas dangereux, et il
 * se retire par lot. Le cliquet borne donc la dette et force sa décrue, comme
 * ses deux aînés (#4302, #4531) :
 *
 * 1. tout fichier HORS de la dette héritée qui réécrit un schéma de RÉPONSE est
 *    un ROUGE — ce qui interdit le soixante-septième, ET interdit le RETOUR d'un
 *    bouchon dans l'une des 19 suites que #4649 vient de convertir ;
 * 2. la dette héritée ne peut que RÉTRÉCIR (moins de bouchons qu'au gel).
 *
 * ## Ce que le cliquet ne garde PAS, et pourquoi
 *
 * Les schémas de REQUÊTE. Un bouchon permissif y masque un REFUS attendu, pas
 * un champ supprimé — un risque AUTRE, qui se traite dans son propre lot. La
 * mesure de #4649 le prouve à contre-emploi : les TROIS seules suites qui
 * rougissent quand on leur retire leur bouchon sont exactement les trois qui
 * bouchonnent une REQUÊTE. Le classement ne se fait donc pas sur le NOM d'un
 * schéma mais sur ce que la PRODUCTION en fait : est de réponse ce qu'une route
 * cite dans un bloc `response:`.
 *
 * ## La borne de non-vacuité passe AVANT les règles
 *
 * Une garde négative dont le balayage rend `[]` reste verte, et pour la pire
 * des raisons. Le premier témoin prouve donc que le balayage voit les suites,
 * voit la production, et sait DISTINGUER une réponse d'une requête — sans quoi
 * les deux règles ne diraient rien.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { join } from 'path';

import {
  balayerBouchonsDeReponse,
  clesReecrites,
  identifiantsDeReponse,
} from '../helpers/schema-stub-sweep';

const SRC_DIR = join(__dirname, '..', '..');

/**
 * La dette HÉRITÉE, mesurée le 2026-09-01 sur `dev` APRÈS la conversion des 19
 * suites du groupe 1 de #4649 — fichier → nombre de schémas de RÉPONSE réécrits.
 *
 * Elle ne se regèle PAS à la hausse : une entrée qui monte fait rougir la règle
 * 1 (le fichier n'est pas « hors dette », mais son surplus l'est) via la règle
 * 2, et c'est le seul moment où quelqu'un relit ce tableau.
 */
const DETTE_HERITEE: Readonly<Record<string, number>> = {
  '__tests__/unit/routes/anonymous-username-namespace.test.ts': 3,
  '__tests__/unit/routes/anonymous.test.ts': 3,
  '__tests__/unit/routes/attachments-metadata.test.ts': 3,
  '__tests__/unit/routes/attachments-upload.test.ts': 2,
  '__tests__/unit/routes/auth-login.test.ts': 3,
  '__tests__/unit/routes/auth/phone-transfer.test.ts': 1,
  '__tests__/unit/routes/calls-leave-already-ended.test.ts': 2,
  '__tests__/unit/routes/calls-routes.test.ts': 2,
  '__tests__/unit/routes/communities-settings.test.ts': 2,
  '__tests__/unit/routes/community-preferences-routes.test.ts': 1,
  '__tests__/unit/routes/conversation-core.test.ts': 3,
  '__tests__/unit/routes/conversation-leave-ban-delete-stats.test.ts': 1,
  '__tests__/unit/routes/conversation-new-member-rights-parity.test.ts': 3,
  '__tests__/unit/routes/conversation-preferences-routes.test.ts': 1,
  '__tests__/unit/routes/conversation-rejoin-and-ban-evasion.test.ts': 3,
  '__tests__/unit/routes/conversation-restore-for-me-broadcast.test.ts': 1,
  '__tests__/unit/routes/conversation-search-threads.test.ts': 2,
  '__tests__/unit/routes/conversation-sharing.test.ts': 3,
  '__tests__/unit/routes/conversations-search-routes.test.ts': 2,
  '__tests__/unit/routes/conversations-stats.test.ts': 1,
  '__tests__/unit/routes/conversations-threads.test.ts': 1,
  '__tests__/unit/routes/conversations/delta-tombstones-detached-promise.test.ts': 3,
  '__tests__/unit/routes/conversations/search.test.ts': 2,
  '__tests__/unit/routes/conversations/stats.test.ts': 1,
  '__tests__/unit/routes/conversations/threads.test.ts': 1,
  '__tests__/unit/routes/friends-routes.test.ts': 2,
  '__tests__/unit/routes/links-admin-host-not-creator.test.ts': 1,
  '__tests__/unit/routes/links-admin-revocation.test.ts': 1,
  '__tests__/unit/routes/links-admin.test.ts': 1,
  '__tests__/unit/routes/links-messages-retrieval.test.ts': 1,
  '__tests__/unit/routes/links-messages.test.ts': 1,
  '__tests__/unit/routes/links-retrieval.test.ts': 1,
  '__tests__/unit/routes/links-user.test.ts': 1,
  '__tests__/unit/routes/links/admin.test.ts': 1,
  '__tests__/unit/routes/links/messages-body-contract.test.ts': 1,
  '__tests__/unit/routes/links/messages-extended.test.ts': 1,
  '__tests__/unit/routes/links/messages-retrieval.test.ts': 1,
  '__tests__/unit/routes/links/messages.test.ts': 1,
  '__tests__/unit/routes/links/validation.test.ts': 1,
  '__tests__/unit/routes/me/index.test.ts': 1,
  '__tests__/unit/routes/me/preferences/categories.test.ts': 1,
  '__tests__/unit/routes/me/preferences/index.test.ts': 1,
  '__tests__/unit/routes/me/preferences/privacy-legacy-storage.test.ts': 1,
  '__tests__/unit/routes/messages-routes.test.ts': 2,
  '__tests__/unit/routes/notifications-routes.test.ts': 2,
  '__tests__/unit/routes/participants-membership-fanout.test.ts': 2,
  '__tests__/unit/routes/participants.test.ts': 2,
  '__tests__/unit/routes/password-reset.test.ts': 2,
  '__tests__/unit/routes/push-tokens-routes.test.ts': 1,
  '__tests__/unit/routes/reactions-routes.test.ts': 3,
  '__tests__/unit/routes/signal-session-departed-member.test.ts': 4,
  '__tests__/unit/routes/tracking-links/creation-extended.test.ts': 3,
  '__tests__/unit/routes/tracking-links/creation-remaining.test.ts': 3,
  '__tests__/unit/routes/tracking-links/tracking-extended.test.ts': 3,
  '__tests__/unit/routes/translation-blocking-ownership.test.ts': 1,
  '__tests__/unit/routes/translation-non-blocking-routes.test.ts': 1,
  '__tests__/unit/routes/translation-routes.test.ts': 1,
  '__tests__/unit/routes/user-deletions-broadcast.test.ts': 1,
  '__tests__/unit/routes/users-blocking.test.ts': 1,
  '__tests__/unit/routes/users-contact-change.test.ts': 1,
  '__tests__/unit/routes/users-devices.test.ts': 2,
  '__tests__/unit/routes/users/profile-extended.test.ts': 3,
  '__tests__/unit/routes/voice-analysis-legacy-alias.test.ts': 1,
  '__tests__/unit/routes/voice-identity-spoofing.test.ts': 1,
  '__tests__/unit/routes/voice-profile-extended.test.ts': 1,
  '__tests__/unit/routes/voice-profile.test.ts': 1,
};

const NOMBRE_HERITE = Object.values(DETTE_HERITEE).reduce((somme, n) => somme + n, 0);

/**
 * Les 19 suites que #4649 a converties : elles emploient le VRAI schéma,
 * IMPORTÉ, jamais réécrit. Elles sont nommées ici et non dans la dette parce
 * que le cliquet doit rougir si l'une d'elles reprend un bouchon — la mutation
 * qui prouve qu'il tombe.
 */
const CONVERTIES: readonly string[] = [
  '__tests__/unit/routes/affiliate.test.ts',
  '__tests__/unit/routes/anonymous-extended.test.ts',
  '__tests__/unit/routes/attachments-download.test.ts',
  '__tests__/unit/routes/attachments-translation.test.ts',
  '__tests__/unit/routes/auth-phone-transfer.test.ts',
  '__tests__/unit/routes/auth-register.test.ts',
  '__tests__/unit/routes/auth/magic-link.test.ts',
  '__tests__/unit/routes/communities-members.test.ts',
  '__tests__/unit/routes/links-management.test.ts',
  '__tests__/unit/routes/me-preferences.test.ts',
  '__tests__/unit/routes/me/preferences/application-legacy-consent-keys.test.ts',
  '__tests__/unit/routes/me/preferences/preference-router-factory.test.ts',
  '__tests__/unit/routes/me/preferences/unified-routes.test.ts',
  '__tests__/unit/routes/signal-protocol-routes.test.ts',
  '__tests__/unit/routes/translation-routes-extended.test.ts',
  '__tests__/unit/routes/user-deletions-routes.test.ts',
  '__tests__/unit/routes/users/profile.test.ts',
  '__tests__/unit/routes/voice-analysis.test.ts',
  '__tests__/unit/routes/voice-translation.test.ts',
];

const balayage = () => balayerBouchonsDeReponse(SRC_DIR);

describe('cliquet des bouchons de schéma de RÉPONSE (#4649)', () => {
  it('borne de non-vacuité — le balayage voit les suites, la production, et sait les distinguer', () => {
    const { suitesLues, identifiantsDeReponse: identifiants } = balayage();

    expect(suitesLues).toBeGreaterThan(1000);
    expect(identifiants.size).toBeGreaterThan(50);

    // Le classement se lit dans la PRODUCTION, et il sépare bien les deux
    // familles : sans cette preuve, la règle 1 pourrait aussi bien interdire
    // les bouchons de REQUÊTE, que #4649 laisse délibérément en place.
    expect(identifiants.has('errorResponseSchema')).toBe(true);
    expect(identifiants.has('validationErrorResponseSchema')).toBe(true);
    expect(identifiants.has('registerRequestSchema')).toBe(false);
    expect(identifiants.has('establishSessionRequestSchema')).toBe(false);
  });

  // Les deux fixtures composent leur spécificateur au lieu de l'écrire : sans
  // cela, ce fichier-ci porterait un `jest.mock('@meeshy/shared/types…')`
  // littéral et le cliquet se DÉNONCERAIT lui-même à la règle 1. Le balayage a
  // raison de le voir — c'est bien un bouchon dans une suite ; c'est la fixture
  // qui doit cesser d'en être un.
  const SPEC = '@meeshy/shared/types/api-schemas';

  it('un schéma servi par jest.requireActual n’est PAS un bouchon', () => {
    const importe = `
      jest.mock('${SPEC}', () => ({
        ...(jest.requireActual('${SPEC}') as object),
        establishSessionRequestSchema: { type: 'object', additionalProperties: true },
      }));
    `;
    const reecrit = `
      jest.mock('${SPEC}', () => ({
        errorResponseSchema: { type: 'object', properties: { success: { type: 'boolean' } } },
      }));
    `;

    expect(clesReecrites(importe).map((c) => c.cle)).toEqual(['establishSessionRequestSchema']);
    expect(clesReecrites(reecrit).map((c) => c.cle)).toEqual(['errorResponseSchema']);
  });

  it('un identifiant cité HORS d’un bloc response: n’est pas un schéma de réponse', () => {
    const route = `
      fastify.post('/x', { schema: {
        body: creerTrucRequestSchema,
        response: { 200: trucResponseSchema, 401: errorResponseSchema },
      } }, handler);
    `;
    const identifiants = identifiantsDeReponse(route);

    expect([...identifiants].sort()).toEqual(['errorResponseSchema', 'trucResponseSchema']);
  });

  it('règle 1 — aucune suite hors de la dette héritée ne réécrit un schéma de RÉPONSE', () => {
    const intrus = balayage()
      .bouchons.filter((b) => DETTE_HERITEE[b.fichier] === undefined)
      .map((b) => `${b.fichier} :: ${b.cle} (${b.spec})`);

    expect(intrus).toEqual([]);
  });

  it('règle 2 — le nombre de bouchons hérités ne remonte pas', () => {
    const bouchons = balayage().bouchons;
    const parFichier = new Map<string, number>();
    for (const b of bouchons) parFichier.set(b.fichier, (parFichier.get(b.fichier) ?? 0) + 1);

    // Le message porte le DÉTAIL : sans lui, un dépassement de un n'apprend pas
    // QUEL fichier a grossi, et la première réaction est de regeler le nombre —
    // c'est-à-dire de ne plus lire le cliquet.
    const aGrossi = [...parFichier.entries()]
      .filter(([fichier, n]) => n > (DETTE_HERITEE[fichier] ?? 0))
      .map(([fichier, n]) => `${fichier} : ${DETTE_HERITEE[fichier] ?? 0} → ${n}`);

    expect(aGrossi).toEqual([]);
    expect(bouchons.length).toBeLessThanOrEqual(NOMBRE_HERITE);
  });

  it('les 19 suites converties emploient le VRAI schéma — un bouchon qui y revient est un ROUGE', () => {
    const bouchonnees = new Set(balayage().bouchons.map((b) => b.fichier));
    const revenues = CONVERTIES.filter((fichier) => bouchonnees.has(fichier));

    expect(revenues).toEqual([]);
    // La liste est le SUJET de ce témoin : vide, il ne garderait rien.
    expect(CONVERTIES.length).toBe(19);
    expect(CONVERTIES.every((f) => DETTE_HERITEE[f] === undefined)).toBe(true);
  });
});

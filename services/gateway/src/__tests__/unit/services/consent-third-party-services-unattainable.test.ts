/**
 * Témoin de l'issue #4343 — « Un consentement que personne ne peut accorder
 * bloque deux préférences pour tout le monde ».
 *
 * `ConsentValidationService.getConsentStatus` dérive
 * `hasThirdPartyServicesConsent` de `applicationPrefs.thirdPartyServicesConsentAt`
 * (le blob JSON `UserPreferences.application`). Trois faits, chacun vérifié
 * séparément lors de la livraison de ce fichier :
 *
 *   1. Aucune route n'ÉCRIT ce champ — sept occurrences dans
 *      `ConsentValidationService.ts`, toutes des lectures (aucun
 *      `create`/`update`/`upsert` dans tout le dépôt).
 *   2. `ApplicationPreferenceSchema` (`packages/shared/types/preferences/application.ts`)
 *      ne le déclare pas : c'est un `z.object()` NU, mode *strip* Zod par
 *      défaut — la clé disparaît en silence dès qu'un client la soumet, sur
 *      les DEUX chemins d'écriture (`PUT` via `.parse()`, `PATCH` via
 *      `.partial().parse()`).
 *   3. `User` n'a AUCUNE colonne `thirdPartyServicesConsentAt`
 *      (`packages/shared/prisma/schema.prisma` — seules
 *      `dataProcessingConsentAt`, `voiceDataConsentAt`,
 *      `voiceProfileConsentAt`, `voiceCloningEnabledAt` existent).
 *
 * Conséquence, prouvée ci-dessous : `hasThirdPartyServicesConsent` vaut FAUX
 * pour tout le monde, TOUJOURS — et `betaFeaturesEnabled` /
 * `scanFilesForMalware` sont inactivables par quiconque, quel que soit ce que
 * l'utilisateur a par ailleurs obtenu.
 *
 * ## Ce que ce fichier NE fait PAS
 *
 * Il ne tranche PAS l'arbitrage de #4343 — (a) un vrai consentement avec sa
 * colonne, (b) le retrait de l'exigence, (c) son rattachement à
 * `hasDataProcessingConsent`. Il constate l'état PRÉSENT (RED produit, GREEN
 * témoin — la garde fonctionne exactement comme écrite, c'est son OBJET qui
 * n'existe pas), pour que le porteur ait une preuve datée avant de trancher.
 *
 * ## Devenir de ce témoin selon l'option retenue
 *
 * - **(a)** — un vrai consentement, nouvelle colonne `User` + `purpose`
 *   `third-party-services` : ce fichier reste VERT tel quel. La fixture
 *   ci-dessous représente « tout ce qu'un humain pouvait obtenir AVANT (a) » ;
 *   elle n'accorde donc pas le nouveau consentement, et les violations
 *   continuent, à bon droit, de se produire. Le témoin d'OCTROI de (a) (un
 *   utilisateur qui a maintenant accordé `third-party-services` et voit la
 *   garde s'ouvrir) est un fichier séparé, à écrire avec l'implémentation.
 * - **(b)** ou **(c)** — la garde disparaît, ou se replie sur
 *   `hasDataProcessingConsent` (que cette fixture accorde déjà) : les DEUX
 *   `expect(violations).toHaveLength(1)` marqués ⚠ ci-dessous doivent
 *   devenir `toHaveLength(0)` — c'est la SEULE ligne à changer dans chaque
 *   bloc pour transformer ce témoin en garde de non-régression de (b)/(c).
 *   Les assertions sur `requiredConsents` deviennent alors sans objet et se
 *   retirent avec la ligne au-dessus.
 *
 * **Contrainte reprise de l'issue : aucun `it` de ce fichier ne mocke
 * `ApplicationPreferenceSchema`.** Le défaut vit DANS le mode *strip* de
 * Zod ; un double permissif consacrerait l'inverse de ce qu'il croit garder.
 * Les tests du fait n°2 appellent le VRAI schéma et la VRAIE fonction de
 * pipeline (`parseSubmittedKeys`, celle que `PATCH`/`PUT
 * /me/preferences/application` appellent réellement).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { ConsentValidationService } from '../../../services/ConsentValidationService';
import { ApplicationPreferenceSchema } from '@meeshy/shared/types/preferences/application';
import { parseSubmittedKeys } from '../../../routes/me/preferences/preference-registry';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const NOW = new Date();

/**
 * Le maximum qu'un être humain peut obtenir AUJOURD'HUI en empruntant CHAQUE
 * route de consentement existante du dépôt : les quatre colonnes `User`
 * horodatées côté serveur (`POST /voice/profile/consent`,
 * `PUT /me/consents/{purpose}` — les quatre `purpose` de #4180), plus les
 * quatre timestamps `audio` legacy équivalents. `applicationPrefs.application`
 * reste VOLONTAIREMENT vide : aucune route ne peut y poser
 * `thirdPartyServicesConsentAt` (faits 1+2 — voir le second `describe`
 * ci-dessous pour la mesure directe), donc un blob vide EST exactement ce
 * qu'un utilisateur qui a tout accordé obtient réellement, pas une omission
 * de la fixture.
 */
function makePrismaWithEveryAttainableConsent(): PrismaClient {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({
        dataProcessingConsentAt: NOW,
        voiceDataConsentAt: NOW,
        voiceProfileConsentAt: NOW,
        voiceCloningEnabledAt: NOW,
      }),
    },
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue({
        audio: {
          audioTranscriptionEnabledAt: NOW,
          textTranslationEnabledAt: NOW,
          audioTranslationEnabledAt: NOW,
          translatedAudioGenerationEnabledAt: NOW,
        },
        application: {},
      }),
    },
  } as unknown as PrismaClient;
}

describe('#4343 — thirdPartyServicesConsentAt est un consentement que personne ne peut accorder', () => {
  describe('le défaut : un utilisateur totalement consentant reste bloqué', () => {
    it('betaFeaturesEnabled: true viole la garde même avec TOUS les consentements accordables réunis', async () => {
      const sut = new ConsentValidationService(makePrismaWithEveryAttainableConsent());

      const violations = await sut.validatePreferences('u1', 'application', {
        betaFeaturesEnabled: true,
      });

      // ⚠ Sous (b)/(c) de #4343 : `toHaveLength(0)` — voir « Devenir de ce
      // témoin » dans l'en-tête du fichier.
      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe('betaFeaturesEnabled');
      expect(violations[0].requiredConsents).toContain('thirdPartyServicesConsentAt');
    });

    it('scanFilesForMalware: true — même défaut, même utilisateur (la seconde préférence que #4343 nomme)', async () => {
      const sut = new ConsentValidationService(makePrismaWithEveryAttainableConsent());

      const violations = await sut.validatePreferences('u1', 'document', {
        scanFilesForMalware: true,
      });

      // ⚠ Sous (b)/(c) de #4343 : `toHaveLength(0)` — même remarque.
      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe('scanFilesForMalware');
      expect(violations[0].requiredConsents).toContain('thirdPartyServicesConsentAt');
    });

    it('contrôle : la MÊME fixture satisfait sans peine une garde qui dépend réellement de dataProcessingConsent', async () => {
      // Démontre que le blocage ci-dessus n'est pas un artefact de la
      // fixture (un consentement oublié) : la même fixture, sur une garde
      // qui teste ce qu'elle prétend tester, ne produit AUCUNE violation.
      const sut = new ConsentValidationService(makePrismaWithEveryAttainableConsent());

      const violations = await sut.validatePreferences('u1', 'application', {
        telemetryEnabled: true,
      });

      expect(violations).toHaveLength(0);
    });
  });

  describe('fait n°2 mesuré directement : ApplicationPreferenceSchema strippe le champ (mode Zod par défaut)', () => {
    it('PUT (schema.parse) : thirdPartyServicesConsentAt disparaît, le reste du corps survit', () => {
      const clientBody = {
        theme: 'dark',
        betaFeaturesEnabled: true,
        thirdPartyServicesConsentAt: NOW.toISOString(),
      };

      const parsed = ApplicationPreferenceSchema.parse(clientBody);

      expect(parsed).not.toHaveProperty('thirdPartyServicesConsentAt');
      expect(parsed.betaFeaturesEnabled).toBe(true);
      expect(parsed.theme).toBe('dark');
    });

    it('PATCH (schema.partial().parse) : même sort pour un corps partiel', () => {
      const clientBody = { thirdPartyServicesConsentAt: NOW.toISOString() };

      const parsed = ApplicationPreferenceSchema.partial().parse(clientBody);

      expect(parsed).not.toHaveProperty('thirdPartyServicesConsentAt');
    });

    it('le pipeline RÉEL de PATCH/PUT /me/preferences/application (parseSubmittedKeys) confirme la disparition de bout en bout', () => {
      // `parseSubmittedKeys('application', body)` est la fonction que
      // `preference-router-factory.ts` et `unified-routes.ts` appellent
      // réellement pour transformer un corps de requête en document à
      // fusionner — pas une reconstitution locale du pipeline.
      const clientBody = {
        betaFeaturesEnabled: true,
        thirdPartyServicesConsentAt: NOW.toISOString(),
      };

      const submitted = parseSubmittedKeys('application', clientBody);

      expect(submitted).not.toHaveProperty('thirdPartyServicesConsentAt');
      expect(submitted.betaFeaturesEnabled).toBe(true);
    });
  });
});

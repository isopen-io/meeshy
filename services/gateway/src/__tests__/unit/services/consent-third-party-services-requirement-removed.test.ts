/**
 * Témoin de l'issue #4343 — « Un consentement que personne ne peut accorder
 * bloque deux préférences pour tout le monde ». **Tranchée : option (b), le
 * RETRAIT de l'exigence.**
 *
 * ## Ce que ce fichier prouvait avant l'arbitrage
 *
 * `ConsentValidationService.getConsentStatus` dérivait
 * `hasThirdPartyServicesConsent` de `applicationPrefs.thirdPartyServicesConsentAt`
 * (le blob JSON `UserPreferences.application`). Trois faits, chacun vérifié
 * séparément :
 *
 *   1. Aucune route n'ÉCRIVAIT ce champ — sept occurrences dans
 *      `ConsentValidationService.ts`, toutes des lectures.
 *   2. `ApplicationPreferenceSchema` ne le déclarait pas : `z.object()` NU,
 *      mode *strip* Zod par défaut — la clé disparaissait en silence sur les
 *      DEUX chemins d'écriture (`PUT` via `.parse()`, `PATCH` via
 *      `.partial().parse()`). **Ce fait est toujours vrai et toujours
 *      mesuré ci-dessous** : c'est lui qui rendait l'option (a) coûteuse.
 *   3. `User` n'avait AUCUNE colonne miroir.
 *
 * Conséquence ATTENDUE de ces trois faits : `hasThirdPartyServicesConsent`
 * faux pour tout le monde.
 *
 * ## Ce que la mesure sur STAGING a corrigé (2026-08-31)
 *
 * Faux — et le vrai était pire. Le champ EST présent en base, posé non par un
 * geste d'utilisateur mais par la migration
 * `enable_audio_features_in_preferences.js` (un `updateMany({})` de janvier
 * 2026). Relevé sur staging : **207 lignes de préférences sur 207 le portent,
 * pour 223 comptes**. La garde PASSAIT donc pour les comptes dotés d'une
 * ligne, et REFUSAIT les 16 sans ligne.
 *
 * Un verdict de consentement qui dépend de la présence d'une ligne qu'une
 * migration a touchée est indéfendable dans les DEUX sens : ceux qui passaient
 * n'avaient rien consenti, ceux qui étaient refusés n'avaient aucun moyen de
 * consentir. Cela ne change pas l'arbitrage — cela le renforce.
 *
 * Les fixtures ci-dessous restent donc justes pour ce qu'elles gardent (un
 * blob VIDE = un compte sans ligne, le cas refusé), et le premier `describe`
 * exerce en plus le blob PEUPLÉ, celui de la population migrée.
 *
 * ## L'arbitrage, et pourquoi (b)
 *
 * Les trois gardes qui lisaient ce consentement étaient écrites au
 * CONDITIONNEL — « pourrait nécessiter », « **may** require ». Une garde de
 * consentement au conditionnel n'est pas une obligation : c'est une
 * hypothèse. Et la mesure la contredit — le dépôt ne contient ni scanner de
 * logiciels malveillants, ni traitement d'arrière-plan virtuel, et activer
 * un drapeau bêta n'envoie rien nulle part. **Aucun tiers ne reçoit quoi que
 * ce soit**, donc il n'y a rien à consentir : un consentement doit être
 * spécifique et éclairé, et « services tiers » ne nomme ici aucun traitement.
 *
 * ## Ce que ce fichier garde maintenant
 *
 * Que les deux préférences s'activent — pour un utilisateur qui n'a accordé
 * AUCUN consentement, la fixture la plus sévère possible. Le témoin d'avant
 * utilisait « tous les consentements accordables » ; c'était le bon témoin
 * pour montrer le blocage, c'est le mauvais pour garder (b), qui affirme
 * quelque chose de plus fort : ces deux préférences ne dépendent d'AUCUN
 * consentement.
 *
 * **Contrainte reprise de l'issue : aucun `it` de ce fichier ne mocke
 * `ApplicationPreferenceSchema`.** Le défaut vivait DANS le mode *strip* de
 * Zod ; un double permissif consacrerait l'inverse de ce qu'il croit garder.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { ConsentValidationService } from '../../../services/ConsentValidationService';
import { ApplicationPreferenceSchema } from '@meeshy/shared/types/preferences/application';
import { parseSubmittedKeys } from '../../../routes/me/preferences/preference-registry';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const NOW = new Date();

/**
 * Un utilisateur qui n'a RIEN accordé. Fixture volontairement plus sévère
 * que celle d'avant l'arbitrage : si les deux préférences passent ici, elles
 * ne dépendent d'aucun consentement — ce qu'affirme exactement l'option (b).
 */
function makePrismaWithNoConsentAtAll(): PrismaClient {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({
        dataProcessingConsentAt: null,
        voiceDataConsentAt: null,
        voiceProfileConsentAt: null,
        voiceCloningEnabledAt: null,
      }),
    },
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue({ audio: {} }),
    },
  } as unknown as PrismaClient;
}

/**
 * Un compte de la population MIGRÉE : son blob `application` porte
 * `thirdPartyServicesConsentAt`, posé par `enable_audio_features_in_preferences.js`
 * — pas par un geste d'utilisateur. C'est le cas majoritaire mesuré sur
 * staging (207 lignes sur 207), et celui où la garde PASSAIT.
 *
 * Il est exercé ici pour une raison précise : sans lui, le fichier ne
 * garderait que la moitié REFUSÉE de la population, et un retour de la garde
 * lisant le blob resterait vert sur ce cas-là.
 */
function makePrismaWithMigratedBlob(): PrismaClient {
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({
        dataProcessingConsentAt: null,
        voiceDataConsentAt: null,
        voiceProfileConsentAt: null,
        voiceCloningEnabledAt: null,
      }),
    },
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue({
        audio: {},
        application: { thirdPartyServicesConsentAt: NOW },
      }),
    },
  } as unknown as PrismaClient;
}

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
      }),
    },
  } as unknown as PrismaClient;
}

describe('#4343 — les deux préférences que personne ne pouvait activer s\'activent', () => {
  describe('option (b) livrée : ni consentement, ni exigence', () => {
    it('betaFeaturesEnabled: true passe pour un blob PEUPLÉ par la migration — la population réelle de staging (207/207)', async () => {
      const sut = new ConsentValidationService(makePrismaWithMigratedBlob());

      const violations = await sut.validatePreferences('u1', 'application', {
        betaFeaturesEnabled: true,
      });

      expect(violations).toHaveLength(0);
    });

    it('betaFeaturesEnabled: true passe pour un utilisateur qui n\'a accordé AUCUN consentement', async () => {
      const sut = new ConsentValidationService(makePrismaWithNoConsentAtAll());

      const violations = await sut.validatePreferences('u1', 'application', {
        betaFeaturesEnabled: true,
      });

      expect(violations).toHaveLength(0);
    });

    it('scanFilesForMalware: true passe pour le même utilisateur — et c\'est la VALEUR PAR DÉFAUT du schéma', async () => {
      const sut = new ConsentValidationService(makePrismaWithNoConsentAtAll());

      const violations = await sut.validatePreferences('u1', 'document', {
        scanFilesForMalware: true,
      });

      expect(violations).toHaveLength(0);
    });

    it('le contrôle tient toujours : telemetryEnabled reste REFUSÉ sans dataProcessingConsent', async () => {
      // Sans ce témoin, un retrait trop large (« on enlève toutes les
      // gardes ») rendrait le même verdict que l'arbitrage voulu.
      const sut = new ConsentValidationService(makePrismaWithNoConsentAtAll());

      const violations = await sut.validatePreferences('u1', 'application', {
        telemetryEnabled: true,
      });

      expect(violations).toHaveLength(1);
      expect(violations[0].field).toBe('telemetryEnabled');
      expect(violations[0].requiredConsents).toEqual(['dataProcessingConsentAt']);
    });

    it('virtualBackgroundEnabled garde son refus, et ne nomme plus la preuve introuvable', async () => {
      const sut = new ConsentValidationService(makePrismaWithNoConsentAtAll());

      const violations = await sut.validatePreferences('u1', 'video', {
        virtualBackgroundEnabled: true,
      });

      expect(violations).toHaveLength(1);
      expect(violations[0].requiredConsents).toEqual(['dataProcessingConsentAt']);
      expect(violations[0].requiredConsents).not.toContain('thirdPartyServicesConsentAt');
    });

    it('virtualBackgroundEnabled passe dès que dataProcessingConsent est accordé', async () => {
      const sut = new ConsentValidationService(makePrismaWithEveryAttainableConsent());

      const violations = await sut.validatePreferences('u1', 'video', {
        virtualBackgroundEnabled: true,
      });

      expect(violations).toHaveLength(0);
    });
  });

  describe('garde de non-retour : aucune violation ne peut plus exiger le consentement fantôme', () => {
    const SOURCE = fs.readFileSync(
      path.join(__dirname, '../../../services/ConsentValidationService.ts'),
      'utf-8'
    );

    it('la garde saurait rougir : le motif cherché est bien celui que le code portait', () => {
      // Sans ce témoin, la garde négative ci-dessous pourrait être morte à
      // la naissance (motif qui ne correspond à rien). On vérifie sur la
      // forme EXACTE que le fichier portait avant #4343.
      const formeHistorique = `requiredConsents: ['thirdPartyServicesConsentAt']`;
      expect(/requiredConsents:\s*\[[^\]]*thirdPartyServicesConsentAt/.test(formeHistorique)).toBe(
        true
      );
    });

    it('aucun requiredConsents du service ne nomme thirdPartyServicesConsentAt', () => {
      const codeSansCommentaires = SOURCE.replace(/\/\/[^\n]*/g, '').replace(
        /\/\*[\s\S]*?\*\//g,
        ''
      );

      expect(codeSansCommentaires).not.toMatch(
        /requiredConsents:\s*\[[^\]]*thirdPartyServicesConsentAt/
      );
    });

    it('le service ne dérive plus aucun hasThirdPartyServicesConsent', () => {
      const codeSansCommentaires = SOURCE.replace(/\/\/[^\n]*/g, '').replace(
        /\/\*[\s\S]*?\*\//g,
        ''
      );

      expect(codeSansCommentaires).not.toContain('hasThirdPartyServicesConsent');
    });
  });

  describe('fait n°2, toujours mesuré : ApplicationPreferenceSchema strippe le champ (mode Zod par défaut)', () => {
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

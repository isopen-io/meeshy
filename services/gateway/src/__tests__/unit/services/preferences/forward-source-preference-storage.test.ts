/**
 * La préférence « afficher la source de mes transferts » doit SURVIVRE à
 * l'aller-retour base → portes de diffusion.
 *
 * C'est le témoin du piège le plus coûteux de ce chantier : le gateway ne lit
 * PAS les seize clés du schéma Zod partagé. `privacy-storage` ne retenait du
 * document que les clés de `PRIVACY_KEY_MAPPING` — huit clés kebab-case figées
 * en janvier 2026. Une clé neuve ajoutée au seul schéma partagé serait donc
 * acceptée par le `PATCH`, écrite en base, ré-affichée fidèlement par l'écran
 * de réglages… et JETÉE à la relecture par toute porte serveur.
 *
 * L'utilisateur verrait « désactivé » à l'écran pendant que le gateway
 * continuerait d'envoyer les noms. Le réglage semblerait marcher de bout en
 * bout sans avoir le moindre effet — exactement le rideau que ce chantier
 * existe pour supprimer, et vert en tests si l'on ne teste que la route.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { loadStoredPrivacyPreferences } from '../../../../services/preferences/privacy-storage';
import { PRIVACY_PREFERENCES_DEFAULTS } from '../../../../config/user-preferences-defaults';

const USER_ID = '507f1f77bcf86cd799439011';

const prismaWithDocument = (privacy: unknown) =>
  ({
    userPreferences: { findMany: jest.fn<any>().mockResolvedValue([{ userId: USER_ID, privacy }]) },
    userPreference: { findMany: jest.fn<any>().mockResolvedValue([]) },
  }) as any;

const prismaWithoutDocument = () =>
  ({
    userPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userPreference: { findMany: jest.fn<any>().mockResolvedValue([]) },
  }) as any;

describe('showForwardSource — le rangement que les portes de diffusion lisent', () => {
  it("relit l'opt-out écrit dans le document JSON", async () => {
    const stored = await loadStoredPrivacyPreferences(
      prismaWithDocument({ showForwardSource: false }),
      [USER_ID],
    );

    expect(stored.get(USER_ID)?.showForwardSource).toBe(false);
  });

  it("relit l'opt-IN explicite", async () => {
    const stored = await loadStoredPrivacyPreferences(
      prismaWithDocument({ showForwardSource: true, showReadReceipts: false }),
      [USER_ID],
    );

    expect(stored.get(USER_ID)?.showForwardSource).toBe(true);
    expect(stored.get(USER_ID)?.showReadReceipts).toBe(false);
  });

  it("ne fabrique RIEN quand le document existe sans la clé — la prod ne migre pas", async () => {
    const stored = await loadStoredPrivacyPreferences(
      prismaWithDocument({ showReadReceipts: false }),
      [USER_ID],
    );

    expect(stored.get(USER_ID)).not.toHaveProperty('showForwardSource');
  });

  it("ne fabrique RIEN quand l'utilisateur n'a AUCUN document", async () => {
    const stored = await loadStoredPrivacyPreferences(prismaWithoutDocument(), [USER_ID]);

    expect(stored.get(USER_ID)?.showForwardSource).toBeUndefined();
  });

  it('est déclarée TRUE par défaut côté serveur — un opt-out, pas un opt-in', () => {
    expect(PRIVACY_PREFERENCES_DEFAULTS.showForwardSource).toBe(true);
  });
});

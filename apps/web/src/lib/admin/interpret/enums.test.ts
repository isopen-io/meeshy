import { beforeAll, describe, expect, test } from 'bun:test';

import { ADMIN_LANGUAGES, loadAdminInterfaceCatalog, translateAdminMaybe } from '@/lib/i18n-admin-catalog';

import {
  ENUM_FAMILIES,
  accountStateOf,
  interpretActivityBucket,
  interpretBroadcastStatus,
  interpretCallQuality,
  interpretCircuitState,
  interpretEnum,
  interpretPresence,
  interpretReportAction,
  interpretRole,
  interpretTranslationQuality,
  shareLinkStateOf,
  trackingLinkStateOf,
  type AdminEnumFamily,
} from './enums';

const NOW = new Date('2026-09-30T14:00:00Z');
const PAST = '2026-09-01T00:00:00Z';
const FUTURE = '2026-12-01T00:00:00Z';

beforeAll(async () => {
  await Promise.all(ADMIN_LANGUAGES.map((language) => loadAdminInterfaceCatalog(language)));
});

const families = Object.keys(ENUM_FAMILIES) as AdminEnumFamily[];
const codesOf = (family: AdminEnumFamily): readonly string[] => Object.keys(ENUM_FAMILIES[family]);

describe('chaque code de chaque famille est nommé dans les quatre langues de l’administration', () => {
  test('la table couvre les vingt-neuf tables de la spécification (qualité d’appel et de traduction se partagent la leur)', () => {
    expect(families).toHaveLength(29);
  });

  for (const family of families) {
    test(`${family} : libellé, ton et explication existent partout`, () => {
      for (const language of ADMIN_LANGUAGES) {
        for (const code of codesOf(family)) {
          const value = interpretEnum(family, code, language);
          expect({ language, family, code, unrecognized: value.label === translateAdminMaybe(language, 'admin.value.unrecognized') }).toEqual({
            language,
            family,
            code,
            unrecognized: false,
          });
          const entry: { readonly explain?: string } = ENUM_FAMILIES[family][code as never];
          if (entry.explain !== undefined) expect({ language, family, code, explain: value.explain === null }).toEqual({ language, family, code, explain: false });
        }
      }
    });

    test(`${family} : aucun code brut dans un libellé`, () => {
      for (const code of codesOf(family)) {
        const { label, raw } = interpretEnum(family, code, 'fr');
        expect({ family, code, label }).not.toEqual({ family, code, label: raw });
        expect(label).not.toMatch(/_/);
      }
    });
  }
});

describe('une énumération inconnue ne fuit jamais son code', () => {
  test('« Non reconnu », ton neutre, le code brut seulement dans raw', () => {
    expect(interpretRole('SUPERVILLAIN', 'fr')).toEqual({
      label: 'Non reconnu',
      tone: 'neutral',
      explain: null,
      raw: 'SUPERVILLAIN',
    });
  });

  test('une absence se dit « Non renseigné »', () => {
    expect(interpretRole(null, 'fr').label).toBe('Non renseigné');
    expect(interpretRole('', 'fr').label).toBe('Non renseigné');
    expect(interpretRole(undefined, 'fr').raw).toBe('');
  });

  test('la casse du code servi ne compte pas', () => {
    expect(interpretBroadcastStatus('sending', 'fr').label).toBe('Envoi en cours');
    expect(interpretBroadcastStatus('SENDING', 'fr').label).toBe('Envoi en cours');
  });
});

describe('les rôles', () => {
  test('les six rôles, leur ton et leur explication', () => {
    expect(interpretRole('BIGBOSS', 'fr')).toMatchObject({ label: 'Créateur', tone: 'brand', explain: 'Tous les droits, y compris les gestes souverains.' });
    expect(interpretRole('ADMIN', 'fr')).toMatchObject({ label: 'Administrateur', tone: 'brand' });
    expect(interpretRole('MODERATOR', 'fr')).toMatchObject({ label: 'Modérateur', tone: 'info' });
    expect(interpretRole('AUDIT', 'fr')).toMatchObject({ label: 'Auditeur', tone: 'info' });
    expect(interpretRole('ANALYST', 'fr')).toMatchObject({ label: 'Analyste', tone: 'neutral' });
    expect(interpretRole('USER', 'fr')).toMatchObject({ label: 'Membre', tone: 'neutral' });
  });

  test('les alias : MODO, CREATOR, MEMBER', () => {
    expect(interpretRole('MODO', 'fr').label).toBe('Modérateur');
    expect(interpretRole('CREATOR', 'fr').label).toBe('Administrateur');
    expect(interpretRole('MEMBER', 'fr').label).toBe('Membre');
  });

  test('l’alias garde le code servi dans raw', () => {
    expect(interpretRole('MODO', 'fr').raw).toBe('MODO');
  });
});

describe('les familles aux subtilités', () => {
  test('reportAction : une seule explication pour toute la famille — « ne déclenche rien »', () => {
    const explain = interpretReportAction('user_banned', 'fr').explain;
    expect(explain).toBe('Consigné par le modérateur : ce libellé ne déclenche rien par lui-même.');
    expect(interpretReportAction('none', 'fr').explain).toBe(explain);
  });

  test('circuitState : OPEN est coupé, et le dit', () => {
    expect(interpretCircuitState('OPEN', 'fr')).toMatchObject({ label: 'Coupé', tone: 'danger' });
    expect(interpretCircuitState('CLOSED', 'fr')).toMatchObject({ label: 'Normal', tone: 'success' });
  });

  test('activityBucket se lit par POSITION, jamais par le libellé que la passerelle sert', () => {
    expect([0, 1, 2, 3].map((index) => interpretActivityBucket(index, 'fr').label)).toEqual(['Très actifs', 'Actifs', 'Occasionnels', 'Inactifs']);
    expect(interpretActivityBucket(4, 'fr').label).toBe('Non reconnu');
    expect(interpretActivityBucket(1.5, 'fr').label).toBe('Non renseigné');
  });

  test('qualité d’appel et de traduction : tons d’état', () => {
    expect(interpretCallQuality('excellent', 'fr').tone).toBe('success');
    expect(interpretTranslationQuality('poor', 'fr')).toMatchObject({ label: 'Mauvaise', tone: 'danger' });
  });

  test('présence : une présence masquée n’est jamais « hors ligne depuis toujours »', () => {
    expect(interpretPresence('unknown', 'fr')).toMatchObject({ label: 'Non communiquée' });
    expect(interpretPresence('unknown', 'fr').explain).not.toBeNull();
  });

  test('un ton non neutre porte un glyphe : jamais la couleur seule', () => {
    expect(interpretRole('MODERATOR', 'fr').glyph).toBe('info');
    expect(interpretBroadcastStatus('FAILED', 'fr').glyph).toBe('warningCircle');
    expect(interpretBroadcastStatus('DRAFT', 'fr').glyph).toBeUndefined();
  });
});

describe('accountStateOf — un seul état, le plus grave d’abord', () => {
  const vierge = { isActive: true, deletedAt: null, deactivatedAt: null, lockedUntil: null, activeBan: false };

  test('actif par défaut', () => {
    expect(accountStateOf(vierge, NOW, 'fr')).toMatchObject({ label: 'Actif', tone: 'success' });
  });

  test('supprimé > banni > verrouillé > désactivé', () => {
    const tout = { isActive: false, deletedAt: PAST, deactivatedAt: PAST, lockedUntil: FUTURE, activeBan: true };
    expect(accountStateOf(tout, NOW, 'fr').label).toBe('Supprimé');
    expect(accountStateOf({ ...tout, deletedAt: null }, NOW, 'fr').label).toBe('Banni');
    expect(accountStateOf({ ...tout, deletedAt: null, activeBan: false }, NOW, 'fr').label).toBe('Verrouillé');
    expect(accountStateOf({ ...tout, deletedAt: null, activeBan: false, lockedUntil: null }, NOW, 'fr').label).toBe('Désactivé');
  });

  test('un verrou PASSÉ ne verrouille plus', () => {
    expect(accountStateOf({ ...vierge, lockedUntil: PAST }, NOW, 'fr').label).toBe('Actif');
  });

  test('isActive faux seul suffit à désactiver', () => {
    expect(accountStateOf({ ...vierge, isActive: false }, NOW, 'fr').label).toBe('Désactivé');
  });
});

describe('shareLinkStateOf et trackingLinkStateOf', () => {
  test('lien de partage : fermé > expiré > quota atteint > actif', () => {
    const lien = { isActive: true, expiresAt: FUTURE, maxUses: 50, currentUses: 12 };
    expect(shareLinkStateOf(lien, NOW, 'fr').label).toBe('Actif');
    expect(shareLinkStateOf({ ...lien, currentUses: 50 }, NOW, 'fr').label).toBe('Quota atteint');
    expect(shareLinkStateOf({ ...lien, currentUses: 50, expiresAt: PAST }, NOW, 'fr').label).toBe('Expiré');
    expect(shareLinkStateOf({ ...lien, currentUses: 50, expiresAt: PAST, isActive: false }, NOW, 'fr').label).toBe('Fermé');
  });

  test('sans limite d’utilisations, le quota n’est jamais atteint', () => {
    expect(shareLinkStateOf({ isActive: true, expiresAt: null, maxUses: null, currentUses: 9999 }, NOW, 'fr').label).toBe('Actif');
    expect(shareLinkStateOf({ isActive: true, expiresAt: null, maxUses: 0, currentUses: 3 }, NOW, 'fr').label).toBe('Actif');
  });

  test('lien de suivi : désactivé > expiré > actif', () => {
    expect(trackingLinkStateOf({ isActive: true, expiresAt: null }, NOW, 'fr').label).toBe('Actif');
    expect(trackingLinkStateOf({ isActive: true, expiresAt: PAST }, NOW, 'fr').label).toBe('Expiré');
    expect(trackingLinkStateOf({ isActive: false, expiresAt: PAST }, NOW, 'fr').label).toBe('Désactivé');
  });
});

import { describe, expect, test } from 'bun:test';

import {
  ADMIN_PREFERENCE_CATEGORIES,
  adminUserPreferencesQueryKey,
  decodeAdminUserPreferences,
  loadAdminUserPreferences,
  patchAdminUserPreference,
} from './admin-user-preferences';
import type { HttpTransport } from './http';
import { persistableQuery } from './query-client';
import { estClefSouveraine } from './souverain';

/**
 * LES PRÉFÉRENCES D'UN MEMBRE, DEPUIS SA FICHE (#7845 A/B) —
 * `GET /api/v1/admin/users/:userId/preferences` et
 * `PATCH …/preferences/:category`.
 *
 * Trois traits du contrat sont gardés ici :
 *
 * 1. **Le type d'un champ vient du DESCRIPTEUR servi** (`z.toJSONSchema` côté
 *    passerelle), jamais de la valeur : un `false` ne dit pas s'il s'agit d'un
 *    interrupteur ou d'un réglage que l'administrateur n'a pas le droit de
 *    toucher.
 * 2. **Un consentement est en LECTURE SEULE** — la liste `readOnly` servie
 *    gagne sur tout le reste, et la passerelle le refuse de toute façon (403).
 * 3. **La clé n'est PAS persistée** : la confidentialité d'un membre n'a rien à
 *    faire sur le disque du navigateur de l'administrateur.
 */

const CATEGORIE_PRIVACY = {
  values: { showOnlineStatus: true, encryptionPreference: 'optional', searchRadius: 20, nickname: 'ami', extras: { a: 1 } },
  stored: ['showOnlineStatus'],
  fields: {
    showOnlineStatus: { type: 'boolean', default: true },
    encryptionPreference: { type: 'string', enum: ['disabled', 'optional', 'always'], default: 'optional' },
    searchRadius: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
    nickname: { type: 'string', default: '' },
    extras: { type: 'object' },
  },
  readOnly: ['extras'],
};

const CHARGE = {
  userId: 'u-1',
  categories: {
    privacy: CATEGORIE_PRIVACY,
    audio: { values: { voiceProfileConsentAt: null, autoplay: false }, stored: [], fields: { voiceProfileConsentAt: {}, autoplay: { type: 'boolean', default: false } }, readOnly: ['voiceProfileConsentAt'] },
    message: { values: {}, stored: [], fields: {}, readOnly: [] },
    notification: { values: {}, stored: [], fields: {}, readOnly: [] },
    video: { values: {}, stored: [], fields: {}, readOnly: [] },
    document: { values: {}, stored: [], fields: {}, readOnly: [] },
    application: { values: {}, stored: [], fields: {}, readOnly: [] },
  },
};

const transportEspion = (reponse: unknown, ok = true) => {
  const appels: { path: string; method: string; body: unknown }[] = [];
  const transport = {
    request: async (requete: { path: string; method: string; body?: unknown }) => {
      appels.push({ path: requete.path, method: requete.method, body: requete.body });
      return ok ? { ok: true as const, data: reponse } : reponse;
    },
  } as unknown as HttpTransport;
  return { transport, appels };
};

const deps = (transport: HttpTransport) => ({ source: 'gateway' as const, transport });

describe('decodeAdminUserPreferences — sept catégories, un contrôle par champ', () => {
  test('décode les sept catégories, dans l’ordre du registre', () => {
    const preferences = decodeAdminUserPreferences(CHARGE);

    expect(preferences?.userId).toBe('u-1');
    expect(preferences?.categories.map((c) => c.id)).toEqual([...ADMIN_PREFERENCE_CATEGORIES]);
  });

  test('le TYPE vient du descripteur : booléen, liste, nombre borné, texte', () => {
    const privacy = decodeAdminUserPreferences(CHARGE)?.categories[0];
    const champ = (cle: string) => privacy?.fields.find((f) => f.key === cle);

    expect(champ('showOnlineStatus')?.kind).toBe('boolean');
    expect(champ('encryptionPreference')?.kind).toBe('enum');
    expect(champ('encryptionPreference')?.options).toEqual(['disabled', 'optional', 'always']);
    expect(champ('searchRadius')?.kind).toBe('number');
    expect(champ('searchRadius')?.min).toBe(1);
    expect(champ('searchRadius')?.max).toBe(100);
    expect(champ('nickname')?.kind).toBe('text');
  });

  test('porte la valeur EFFECTIVE, le défaut, et dit si la valeur est posée', () => {
    const privacy = decodeAdminUserPreferences(CHARGE)?.categories[0];
    const statut = privacy?.fields.find((f) => f.key === 'showOnlineStatus');
    const chiffrement = privacy?.fields.find((f) => f.key === 'encryptionPreference');

    expect(statut?.value).toBe(true);
    expect(statut?.stored).toBe(true);
    expect(chiffrement?.defaultValue).toBe('optional');
    expect(chiffrement?.stored).toBe(false);
  });

  test('un consentement et `extras` sont en LECTURE SEULE, quel que soit leur type', () => {
    const categories = decodeAdminUserPreferences(CHARGE)?.categories;
    const extras = categories?.[0]?.fields.find((f) => f.key === 'extras');
    const consentement = categories?.[1]?.fields.find((f) => f.key === 'voiceProfileConsentAt');

    expect(extras?.kind).toBe('readonly');
    expect(extras?.readOnly).toBe(true);
    expect(consentement?.kind).toBe('readonly');
    expect(consentement?.readOnly).toBe(true);
  });

  test('un champ au type non décrit (tableau, objet, union) n’est jamais éditable', () => {
    const preferences = decodeAdminUserPreferences({
      userId: 'u-1',
      categories: {
        message: {
          values: { tags: ['a'], mode: null },
          stored: [],
          fields: { tags: { type: 'array' }, mode: {} },
          readOnly: [],
        },
      },
    });
    const champs = preferences?.categories.find((c) => c.id === 'message')?.fields;

    expect(champs?.map((f) => f.kind)).toEqual(['readonly', 'readonly']);
  });

  test('une charge HOSTILE est ignorée champ par champ', () => {
    const preferences = decodeAdminUserPreferences({
      userId: 'u-1',
      categories: {
        privacy: {
          values: { showOnlineStatus: true },
          stored: 'tout',
          fields: { showOnlineStatus: { type: 'boolean', enum: 'x', minimum: '3', pattern: '.*' } },
          readOnly: [42, 'showOnlineStatus'],
          secret: 'fuite',
        },
        inconnue: { values: { x: 1 }, stored: [], fields: {}, readOnly: [] },
      },
      password: 'hash',
    });

    expect(preferences?.categories.map((c) => c.id)).toEqual(['privacy']);
    const champ = preferences?.categories[0]?.fields[0];
    expect(champ?.stored).toBe(false);
    expect(champ?.readOnly).toBe(true);
    expect(Object.keys(champ ?? {})).not.toContain('pattern');
    expect(Object.keys(champ ?? {})).not.toContain('min');
    expect(Object.keys(preferences ?? {})).toEqual(['userId', 'categories']);
  });

  test('rend null sur une charge illisible', () => {
    for (const charge of [null, 'x', [], { userId: 'u-1' }, { categories: {} }]) {
      expect(decodeAdminUserPreferences(charge)).toBeNull();
    }
  });
});

describe('loadAdminUserPreferences', () => {
  test('vise GET /api/v1/admin/users/:id/preferences, identifiant ENCODÉ', async () => {
    const { transport, appels } = transportEspion(CHARGE);

    const resultat = await loadAdminUserPreferences({ ...deps(transport), userId: 'u 1/x' });

    expect(appels[0]?.method).toBe('GET');
    expect(appels[0]?.path).toBe(`/api/v1/admin/users/${encodeURIComponent('u 1/x')}/preferences`);
    expect(resultat.ok && resultat.data.categories).toHaveLength(7);
  });

  test('une charge illisible devient un échec à status 0', async () => {
    const { transport } = transportEspion({ nimporte: 'quoi' });

    const resultat = await loadAdminUserPreferences({ ...deps(transport), userId: 'u-1' });

    expect(!resultat.ok && resultat.status).toBe(0);
  });
});

describe('patchAdminUserPreference — le corps, l’adresse, les refus nommés', () => {
  const ECRITURE = { category: 'privacy', values: { showOnlineStatus: false }, stored: ['showOnlineStatus'] };

  test('envoie `{ values, reason }` en PATCH, les DEUX segments encodés', async () => {
    const { transport, appels } = transportEspion(ECRITURE);

    const resultat = await patchAdminUserPreference({
      ...deps(transport),
      userId: 'u 1',
      category: 'privacy',
      values: { showOnlineStatus: false },
      reason: '  demande du membre  ',
    });

    expect(appels[0]?.method).toBe('PATCH');
    expect(appels[0]?.path).toBe(`/api/v1/admin/users/${encodeURIComponent('u 1')}/preferences/privacy`);
    expect(appels[0]?.body).toEqual({ values: { showOnlineStatus: false }, reason: 'demande du membre' });
    expect(resultat.ok && resultat.data).toEqual({ category: 'privacy', values: { showOnlineStatus: false }, stored: ['showOnlineStatus'] });
  });

  test('n’envoie pas un motif BLANC', async () => {
    const { transport, appels } = transportEspion(ECRITURE);

    await patchAdminUserPreference({ ...deps(transport), userId: 'u-1', category: 'privacy', values: { showOnlineStatus: false }, reason: '   ' });

    expect(Object.keys(appels[0]?.body as object)).toEqual(['values']);
  });

  test('refuse une écriture VIDE avant le réseau', async () => {
    const { transport, appels } = transportEspion(ECRITURE);

    const resultat = await patchAdminUserPreference({ ...deps(transport), userId: 'u-1', category: 'privacy', values: {} });

    expect(appels).toHaveLength(0);
    expect(!resultat.ok && resultat.status).toBe(0);
  });

  test('un refus 403 CONSENT_REQUIRED remonte NOMMÉ', async () => {
    const refus = { ok: false as const, status: 403, error: 'Consent required', code: 'CONSENT_REQUIRED' };
    const { transport } = transportEspion(refus, false);

    const resultat = await patchAdminUserPreference({ ...deps(transport), userId: 'u-1', category: 'privacy', values: { showOnlineStatus: false } });

    expect(resultat).toEqual({ ok: false, status: 403, error: 'CONSENT_REQUIRED', code: 'CONSENT_REQUIRED' });
  });

  test('un refus sans code passe TEL QUEL', async () => {
    const refus = { ok: false as const, status: 500, error: 'Boom' };
    const { transport } = transportEspion(refus, false);

    const resultat = await patchAdminUserPreference({ ...deps(transport), userId: 'u-1', category: 'privacy', values: { a: 1 } });

    expect(resultat).toEqual(refus);
  });
});

describe('la clé des préférences ne touche pas le disque', () => {
  test('elle commence par `admin-souverain`, et `persistableQuery` la refuse', () => {
    const clef = adminUserPreferencesQueryKey('u-1');

    expect(clef[0]).toBe('admin-souverain');
    expect(estClefSouveraine(clef)).toBe(true);
    expect(persistableQuery({ state: { status: 'success' }, queryKey: clef })).toBe(false);
  });
});

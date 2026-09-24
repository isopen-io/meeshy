/**
 * Les préférences d'un membre, lues et écrites depuis SA fiche d'administration
 * (#7845 A/B).
 *
 * Le montage est celui de la production : `registerUserPreferenceRoutes` sous
 * le préfixe `/api/v1`, la VRAIE matrice de permissions (un MODERATOR doit être
 * refusé par elle, pas par un double qui dirait `false`), le VRAI registre des
 * préférences et le VRAI `ConsentValidationService`. Seuls Prisma et les trois
 * gestes d'après-écriture sont doublés — ceux-ci pour attester qu'ils partent.
 *
 * @jest-environment node
 */

import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

const applyCategoryWriteEffects = jest.fn(async () => undefined);

jest.mock('../../../../routes/me/preferences/preference-registry', () => {
  const actual = jest.requireActual('../../../../routes/me/preferences/preference-registry');
  return { ...actual, applyCategoryWriteEffects: (...args: unknown[]) => applyCategoryWriteEffects(...(args as [])) };
});

import { registerUserPreferenceRoutes } from '../../../../routes/admin/user-preferences';
import { PREFERENCE_DESCRIPTORS } from '../../../../routes/me/preferences/preference-descriptors';
import { PREFERENCE_CATEGORIES } from '../../../../routes/me/preferences/preference-registry';
import { UserAuditAction } from '@meeshy/shared/types';

const ADMIN_ID = '507f1f77bcf86cd799439001';
const TARGET_ID = '507f1f77bcf86cd799439777';

type Cible = {
  readonly existe?: boolean;
  readonly role?: string;
  readonly consentements?: Readonly<Record<string, Date | null>>;
  readonly stocke?: Readonly<Record<string, unknown>>;
};

function fauxPrisma(cible: Cible = {}) {
  const ligneUser = {
    id: TARGET_ID,
    role: cible.role ?? 'USER',
    dataProcessingConsentAt: null,
    analyticsConsentAt: null,
    voiceDataConsentAt: null,
    voiceProfileConsentAt: null,
    voiceCloningEnabledAt: null,
    ...(cible.consentements ?? {}),
  };
  const ligneDePreferences = cible.stocke ?? null;
  return {
    user: { findUnique: jest.fn(async () => (cible.existe === false ? null : ligneUser)) },
    userPreferences: {
      findUnique: jest.fn(async () => ligneDePreferences),
      upsert: jest.fn(async () => ({ id: 'prefs-1' })),
    },
    userPreference: { findMany: jest.fn(async () => []), deleteMany: jest.fn(async () => ({ count: 0 })) },
  };
}

type FauxPrisma = ReturnType<typeof fauxPrisma>;

async function monter(prisma: FauxPrisma, role: string) {
  const audit = { createAuditLog: jest.fn(async () => undefined) };
  const app: FastifyInstance = Fastify({ logger: false });
  app.decorate('prisma', prisma as unknown as FastifyInstance['prisma']);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: ADMIN_ID,
      registeredUser: { id: ADMIN_ID, role },
      hasFullAccess: true,
    };
  });
  await app.register(async (scope) => {
    registerUserPreferenceRoutes(scope, { userAuditService: audit as never });
  }, { prefix: '/api/v1' });
  await app.ready();
  return { app, audit };
}

beforeEach(() => {
  applyCategoryWriteEffects.mockClear();
});

describe('GET /admin/users/:userId/preferences', () => {
  it('sert les sept catégories à un ADMIN, défauts comblés, avec la liste des clés STOCKÉES', async () => {
    const prisma = fauxPrisma({ stocke: { privacy: { showLastSeen: false }, audio: null } });
    const { app, audit } = await monter(prisma, 'ADMIN');

    const res = await app.inject({ method: 'GET', url: `/api/v1/admin/users/${TARGET_ID}/preferences` });

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.userId).toBe(TARGET_ID);
    expect(Object.keys(data.categories).sort()).toEqual([...PREFERENCE_CATEGORIES].sort());
    expect(data.categories.privacy.values).toMatchObject({ showLastSeen: false, showOnlineStatus: true });
    expect(data.categories.privacy.stored).toEqual(['showLastSeen']);
    expect(data.categories.audio.stored).toEqual([]);
    expect(data.categories.privacy.fields.showOnlineStatus).toEqual({ type: 'boolean', default: true });
    expect(data.categories.privacy.readOnly).toContain('extras');
    expect(audit.createAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('ne lit que les catégories demandées par ?categories=', async () => {
    const { app } = await monter(fauxPrisma(), 'ADMIN');
    const res = await app.inject({ method: 'GET', url: `/api/v1/admin/users/${TARGET_ID}/preferences?categories=audio,video` });
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json().data.categories).sort()).toEqual(['audio', 'video']);
    await app.close();
  });

  it('refuse un MODERATOR — la confidentialité d\'un membre est une donnée privée', async () => {
    const { app } = await monter(fauxPrisma(), 'MODERATOR');
    const res = await app.inject({ method: 'GET', url: `/api/v1/admin/users/${TARGET_ID}/preferences` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('refuse une catégorie inconnue (400)', async () => {
    const { app } = await monter(fauxPrisma(), 'ADMIN');
    const res = await app.inject({ method: 'GET', url: `/api/v1/admin/users/${TARGET_ID}/preferences?categories=privacy,inconnue` });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('rend 404 pour un membre inexistant', async () => {
    const { app } = await monter(fauxPrisma({ existe: false }), 'ADMIN');
    const res = await app.inject({ method: 'GET', url: `/api/v1/admin/users/${TARGET_ID}/preferences` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('marque en lecture seule chaque clé de consentement, voiceCloningEnabledAt et tutorialsCompleted', async () => {
    const { app } = await monter(fauxPrisma(), 'ADMIN');
    const res = await app.inject({ method: 'GET', url: `/api/v1/admin/users/${TARGET_ID}/preferences?categories=application` });
    const readOnly: string[] = res.json().data.categories.application.readOnly;
    expect(readOnly).toEqual(expect.arrayContaining([
      'dataProcessingConsentAt', 'voiceDataConsentAt', 'voiceCloningEnabledAt', 'tutorialsCompleted', 'extras',
    ]));
    expect(readOnly).not.toContain('theme');
    await app.close();
  });
});

describe('PREFERENCE_DESCRIPTORS', () => {
  it('décrit les sept catégories depuis leur schéma zod, défauts compris', () => {
    for (const category of PREFERENCE_CATEGORIES) {
      expect(Object.keys(PREFERENCE_DESCRIPTORS[category]).length).toBeGreaterThan(0);
    }
    expect(PREFERENCE_DESCRIPTORS.privacy.encryptionPreference).toEqual({
      type: 'string',
      enum: ['disabled', 'optional', 'always'],
      default: 'optional',
    });
  });

  it('ne sert que type, enum, minimum, maximum et default', () => {
    const permises = new Set(['type', 'enum', 'minimum', 'maximum', 'default']);
    for (const category of PREFERENCE_CATEGORIES) {
      for (const champ of Object.values(PREFERENCE_DESCRIPTORS[category])) {
        for (const cle of Object.keys(champ)) expect(permises.has(cle)).toBe(true);
      }
    }
  });
});

describe('PATCH /admin/users/:userId/preferences/:category', () => {
  const patch = (app: FastifyInstance, category: string, payload: unknown) =>
    app.inject({ method: 'PATCH', url: `/api/v1/admin/users/${TARGET_ID}/preferences/${category}`, payload: payload as object });

  it('écrit le document FUSIONNÉ, déclenche les effets et trace avant / après', async () => {
    const prisma = fauxPrisma({ stocke: { privacy: { showLastSeen: false } } });
    const { app, audit } = await monter(prisma, 'ADMIN');

    const res = await patch(app, 'privacy', { values: { showOnlineStatus: false }, reason: 'plainte du membre' });

    expect(res.statusCode).toBe(200);
    const upsert = prisma.userPreferences.upsert.mock.calls[0] as unknown as [{ update: { privacy: Record<string, unknown> } }];
    expect(upsert[0].update.privacy).toMatchObject({ showLastSeen: false, showOnlineStatus: false, showReadReceipts: true });
    expect(applyCategoryWriteEffects).toHaveBeenCalledWith(expect.anything(), TARGET_ID, ['privacy']);
    expect(audit.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      userId: TARGET_ID,
      adminId: ADMIN_ID,
      action: UserAuditAction.UPDATE_PREFERENCES,
      entityId: TARGET_ID,
      changes: { showOnlineStatus: { before: true, after: false } },
      metadata: { reason: 'plainte du membre', category: 'privacy' },
    }));
    const { data } = res.json();
    expect(data.category).toBe('privacy');
    expect(data.values.showOnlineStatus).toBe(false);
    expect(data.stored).toEqual(expect.arrayContaining(['showLastSeen', 'showOnlineStatus']));
    await app.close();
  });

  it('refuse une clé que le schéma ne déclare pas (400 strict)', async () => {
    const prisma = fauxPrisma();
    const { app } = await monter(prisma, 'ADMIN');
    const res = await patch(app, 'privacy', { values: { profileVisibility: 'private' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('VALIDATION_ERROR');
    expect(prisma.userPreferences.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse d\'écrire une clé de consentement — 403 READ_ONLY_PREFERENCE', async () => {
    const prisma = fauxPrisma();
    const { app } = await monter(prisma, 'ADMIN');
    const res = await patch(app, 'application', { values: { dataProcessingConsentAt: '2026-01-01' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('READ_ONLY_PREFERENCE');
    expect(prisma.userPreferences.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('valide les consentements de la CIBLE — 403 CONSENT_REQUIRED', async () => {
    const prisma = fauxPrisma();
    const { app } = await monter(prisma, 'ADMIN');
    const res = await patch(app, 'application', { values: { telemetryEnabled: true } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('CONSENT_REQUIRED');
    expect(res.json().violations[0].field).toBe('telemetryEnabled');
    expect(prisma.userPreferences.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse une cible de rang supérieur (hiérarchie)', async () => {
    const prisma = fauxPrisma({ role: 'BIGBOSS' });
    const { app } = await monter(prisma, 'ADMIN');
    const res = await patch(app, 'privacy', { values: { showOnlineStatus: false } });
    expect(res.statusCode).toBe(403);
    expect(prisma.userPreferences.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse un MODERATOR', async () => {
    const prisma = fauxPrisma();
    const { app } = await monter(prisma, 'MODERATOR');
    const res = await patch(app, 'privacy', { values: { showOnlineStatus: false } });
    expect(res.statusCode).toBe(403);
    expect(prisma.userPreferences.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse une catégorie inconnue (400)', async () => {
    const { app } = await monter(fauxPrisma(), 'ADMIN');
    const res = await patch(app, 'inconnue', { values: { a: true } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('refuse un corps sans `values` (400 au schéma)', async () => {
    const prisma = fauxPrisma();
    const { app } = await monter(prisma, 'ADMIN');
    const res = await patch(app, 'privacy', { showOnlineStatus: false });
    expect(res.statusCode).toBe(400);
    expect(prisma.userPreferences.upsert).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('PATCH /admin/users/:userId/preferences/:category — corps vide', () => {
  it('n\'écrit rien quand `values` ne nomme aucune clé — les défauts ne se gravent pas en valeurs stockées', async () => {
    const prisma = fauxPrisma({ stocke: { audio: { ttsEnabled: true } } });
    const { app, audit } = await monter(prisma, 'ADMIN');
    const res = await app.inject({ method: 'PATCH', url: `/api/v1/admin/users/${TARGET_ID}/preferences/audio`, payload: { values: {} } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.stored).toEqual(['ttsEnabled']);
    expect(prisma.userPreferences.upsert).not.toHaveBeenCalled();
    expect(applyCategoryWriteEffects).not.toHaveBeenCalled();
    expect(audit.createAuditLog).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse une clé de corps inconnue au lieu de la retirer en silence', async () => {
    const prisma = fauxPrisma();
    const { app } = await monter(prisma, 'ADMIN');
    const res = await app.inject({ method: 'PATCH', url: `/api/v1/admin/users/${TARGET_ID}/preferences/privacy`, payload: { values: { showOnlineStatus: false }, force: true } });
    expect(res.statusCode).toBe(400);
    expect(prisma.userPreferences.upsert).not.toHaveBeenCalled();
    await app.close();
  });
});

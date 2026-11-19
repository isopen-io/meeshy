/**
 * LE LIEN D'UNE FICHE COLLÉ DANS UNE CONVERSATION SE DÉPLIE EN CARTE DE PROFIL (#18865).
 *
 * Un message porte `https://meeshy.me/u/amani` ; le client du LECTEUR connecté lit le pseudo
 * (`personHandleFromLink`, `@meeshy/shared/utils/person-link`) et demande la carte à
 * `GET /directory/people/:handle?via=link`. C'est LA porte de la fiche : même loi d'accès,
 * même présence, même ville selon le cercle du lecteur. Le mode `via=link` n'ajoute qu'une
 * chose : ce qu'un lien collé n'a pas à révéler — fiche inconnue, désactivée, cachée de la
 * recherche, bloquée dans un sens ou dans l'autre — répond la MÊME 404 qu'un pseudo inexistant.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

jest.mock('../../../../routes/users/presence-gate', () => ({
  ...(jest.requireActual('../../../../routes/users/presence-gate') as object),
  getOptionalAuth: () => async () => undefined,
}));

import { directoryPersonRoutes } from '../../../../routes/directory/person';
import { clearPrivacyPreferencesCache } from '../../../../services/preferences/privacy-cache';

const PREFIXE = '/api/v1';
const CIBLE = '507f1f77bcf86cd799439011';
const LECTEUR = '507f1f77bcf86cd799439022';

type Etat = {
  readonly existe?: boolean;
  readonly jaiBloque?: boolean;
  readonly mABloque?: boolean;
  readonly cachee?: boolean;
  readonly prefsIllisibles?: boolean;
  readonly isActive?: boolean;
  readonly deletedAt?: Date | null;
  readonly deactivatedAt?: Date | null;
};

const ligne = (etat: Etat) => ({
  id: CIBLE,
  username: 'amani',
  firstName: 'Amani',
  lastName: 'Diallo',
  displayName: 'Amani Diallo',
  avatar: null,
  banner: null,
  bio: 'Je traduis des poèmes wolof.',
  city: 'Dakar',
  cityCircle: 'FRIEND',
  role: 'USER',
  isOnline: true,
  lastActiveAt: new Date('2026-08-01T10:00:00Z'),
  deactivatedAt: etat.deactivatedAt ?? null,
  deletedAt: etat.deletedAt ?? null,
  isActive: etat.isActive ?? true,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2026-08-28T00:00:00Z'),
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  voiceModel: null,
});

const prismaDouble = (etat: Etat) => ({
  profileAddress: { findMany: async () => [] }, communityMember: { findMany: async () => [] },
  user: {
    findFirst: jest.fn(async (args?: { where?: Record<string, unknown> }) => {
      const where = args?.where ?? {};
      const bloque = where.blockedUserIds as { has: string } | undefined;
      if (bloque) {
        if (where.id === LECTEUR && bloque.has === CIBLE) return etat.jaiBloque ? { id: LECTEUR } : null;
        if (where.id === CIBLE && bloque.has === LECTEUR) return etat.mABloque ? { id: CIBLE } : null;
        return null;
      }
      return etat.existe === false ? null : ligne(etat);
    }),
    findUnique: jest.fn(async () => ({ createdAt: new Date('2025-01-01T00:00:00Z') })),
  },
  userPreferences: {
    findMany: jest.fn(async (args: { where: { userId: { in: string[] } } }) => {
      if (etat.prefsIllisibles) throw new Error('privacy read down');
      return args.where.userId.in.map((userId) => ({ userId, privacy: { hideProfileFromSearch: etat.cachee === true } }));
    }),
  },
  userPreference: { findMany: jest.fn(async () => []) },
  friendRequest: { findFirst: jest.fn(async () => null), count: jest.fn(async () => 0) },
});

async function monter(viewerId: string | null, etat: Etat = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prismaDouble(etat) as never);
  (app as unknown as { redis?: unknown }).redis = undefined;
  app.addHook('onRequest', async (req) => {
    (req as unknown as { authContext: unknown }).authContext = viewerId
      ? { isAuthenticated: true, type: 'user', userId: viewerId, registeredUser: { id: viewerId, role: 'USER' } }
      : { isAuthenticated: false, isAnonymous: true, type: 'anonymous', userId: 'anonymous' };
  });
  await app.register(directoryPersonRoutes, { prefix: `${PREFIXE}/directory` });
  await app.ready();
  return app;
}

const lire = async (viewerId: string | null, etat: Etat = {}, url = `${PREFIXE}/directory/people/amani?via=link`) => {
  const app = await monter(viewerId, etat);
  const res = await app.inject({ method: 'GET', url });
  await app.close();
  return res;
};

beforeEach(() => clearPrivacyPreferencesCache());

describe('Le lecteur connecté reçoit la carte composée par la porte de la fiche', () => {
  it('sert l’identité de la personne', async () => {
    const res = await lire(LECTEUR);
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.id).toBe(CIBLE);
    expect(data.username).toBe('amani');
    expect(data.displayName).toBe('Amani Diallo');
    expect(data.bio).toBe('Je traduis des poèmes wolof.');
  });

  it('la ville suit le cercle du lecteur, comme sur la fiche (cercle FRIEND, lecteur sans lien ⇒ absente)', async () => {
    const res = await lire(LECTEUR);
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('Dakar');
  });

  it('un lien vers sa propre fiche se déplie, même cachée de la recherche', async () => {
    const res = await lire(CIBLE, { cachee: true });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.username).toBe('amani');
  });

  it('se lit aussi par la casse d’un pseudo collé', async () => {
    const res = await lire(LECTEUR, {}, `${PREFIXE}/directory/people/AMANI?via=link`);
    expect(res.statusCode).toBe(200);
  });
});

describe('Ce qu’un lien collé n’a pas à révéler répond comme un pseudo inexistant', () => {
  const memeQueInconnu = async (etat: Etat) => {
    const inconnu = await lire(LECTEUR, { existe: false });
    const res = await lire(LECTEUR, etat);
    expect(inconnu.statusCode).toBe(404);
    expect(res.statusCode).toBe(404);
    expect(res.body).toBe(inconnu.body);
    for (const trace of ['amani', 'Amani', 'Diallo', 'wolof', CIBLE]) expect(res.body).not.toContain(trace);
  };

  it('la personne a bloqué le lecteur', async () => memeQueInconnu({ mABloque: true }));
  it('le lecteur a bloqué la personne', async () => memeQueInconnu({ jaiBloque: true }));
  it('la personne se cache de la recherche', async () => memeQueInconnu({ cachee: true }));
  it('sa préférence est illisible (fail-closed)', async () => memeQueInconnu({ prefsIllisibles: true }));
  it('le compte est désactivé', async () => memeQueInconnu({ deactivatedAt: new Date('2026-10-01') }));
  it('le compte est inactif', async () => memeQueInconnu({ isActive: false }));
  it('le compte est supprimé', async () => memeQueInconnu({ deletedAt: new Date('2026-10-01') }));
});

describe('La carte ne se montre qu’à un membre connecté, et la fiche ordinaire ne change pas', () => {
  it('un lecteur sans compte ne reçoit rien de la personne', async () => {
    const res = await lire(null);
    expect(res.statusCode).not.toBe(200);
    for (const trace of ['amani', 'Amani', 'Diallo', 'wolof']) expect(res.body).not.toContain(trace);
  });

  it('sans `via=link`, la fiche d’une personne que le lecteur a bloquée reste servie (c’est de là qu’on débloque)', async () => {
    const res = await lire(LECTEUR, { jaiBloque: true }, `${PREFIXE}/directory/people/amani`);
    expect(res.statusCode).toBe(200);
  });

  it('une valeur inconnue de `via` est ignorée, jamais refusée', async () => {
    const res = await lire(LECTEUR, { jaiBloque: true }, `${PREFIXE}/directory/people/amani?via=autre`);
    expect(res.statusCode).toBe(200);
  });
});

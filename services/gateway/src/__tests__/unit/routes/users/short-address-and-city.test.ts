/**
 * Adresse courte `/@pseudo` et ville déclarée (#18862, chantier #18857).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import net from 'node:net';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

const VIEWER = '507f1f77bcf86cd7994390fe';
const OWNER = '507f1f77bcf86cd799439011';
let viewerLevel: string = 'PUBLIC';
let viewerId: string | null = VIEWER;
let relationReadFails = false;

jest.mock('../../../../routes/users/presence-gate', () => ({
  viewerFromRequest: () => null,
  presenceFor: () => null,
  applyPresenceVisibilityAsOffline: (rows: unknown) => rows,
  gateProfilePresence: async (_f: unknown, _r: unknown, user: unknown) => user,
  getOptionalAuth: () => async (req: any) => {
    req.authContext = viewerId
      ? { type: 'user', isAuthenticated: true, isAnonymous: false, userId: viewerId, registeredUser: { id: viewerId, role: 'USER' } }
      : { type: 'anonymous', isAuthenticated: false, isAnonymous: true, userId: 'x' };
  },
}));

jest.mock('../../../../services/relations/profileCircleView', () => {
  const actual = jest.requireActual('../../../../services/relations/profileCircleView') as object;
  return {
    ...actual,
    readProfileCircleView: async () => {
      if (relationReadFails) throw new Error('relation store unavailable');
      return { level: viewerLevel };
    },
  };
});

import { getUserById, getUserByUsername, userShortAddressAlias } from '../../../../routes/users/profile';

const PREFIXE = '/api/v1';

const ligne = (over: Record<string, unknown> = {}) => ({
  id: OWNER, username: 'aissa', firstName: 'A', lastName: 'N', displayName: 'Aissa',
  avatar: null, banner: null, bio: '', role: 'USER', isOnline: false, lastActiveAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'), voiceModel: null,
  city: 'Dakar', cityCircle: 'FRIEND', ...over,
});

async function monter(row: Record<string, unknown>): Promise<FastifyInstance> {
  const prisma = { user: { findFirst: jest.fn<any>(async (a?: any) => (a?.where?.blockedUserIds ? null : row)) } };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async () => {});
  app.decorate('prisma', prisma as never);
  await app.register(async (i) => {
    await getUserById(i);
    await getUserByUsername(i);
    await userShortAddressAlias(i);
  }, { prefix: PREFIXE });
  await app.ready();
  return app;
}

describe('GET /@:username : l’adresse courte redirige vers l’adresse canonique', () => {
  it('redirige vers /directory/people/<pseudo> (jamais vers l’alias /u/ déprécié) en conservant la requête, et /u/<pseudo> reste servi', async () => {
    const app = await monter(ligne());
    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/@aissa?fields=username` });
    expect(res.statusCode).toBe(307);
    expect(res.headers.location).toBe(`${PREFIXE}/directory/people/aissa?fields=username`);
    const ancien = await app.inject({ method: 'GET', url: `${PREFIXE}/u/aissa` });
    expect(ancien.statusCode).toBe(200);
  });

  it('encode le pseudo et refuse tout pseudo qui n’en est pas un (pas de redirection ouverte)', async () => {
    const app = await monter(ligne());
    const mauvais = await app.inject({ method: 'GET', url: `${PREFIXE}/@..%2F..%2Fevil` });
    expect(mauvais.statusCode).toBe(404);
    const slash = await app.inject({ method: 'GET', url: `${PREFIXE}/@//evil.com` });
    expect(slash.statusCode).not.toBe(307);
  });

  it('suit la règle RÉELLE des pseudos : un pseudo qui commence par « _ » ou « - » est servi, un point ne l’est pas', async () => {
    const app = await monter(ligne());
    const souligne = await app.inject({ method: 'GET', url: `${PREFIXE}/@_aissa` });
    expect(souligne.statusCode).toBe(307);
    expect(souligne.headers.location).toBe(`${PREFIXE}/directory/people/_aissa`);
    const tiret = await app.inject({ method: 'GET', url: `${PREFIXE}/@-aissa` });
    expect(tiret.statusCode).toBe(307);
    const point = await app.inject({ method: 'GET', url: `${PREFIXE}/@ai.ssa` });
    expect(point.statusCode).toBe(404);
  });
});

describe('GET /@:username : une requête aux caractères inhabituels ne rend jamais 500', () => {
  const brut = (port: number, cible: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.write(Buffer.from(`GET ${cible} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`, 'latin1'));
      });
      let recu = '';
      socket.on('data', (morceau) => { recu += morceau.toString('latin1'); });
      socket.on('close', () => resolve(recu.split('\r\n')[0] ?? ''));
      socket.on('error', reject);
    });

  it('par le vrai serveur HTTP : un octet que l’en-tête refuserait est rejeté par l’analyseur (400) avant la route, le reste redirige (307)', async () => {
    const app = await monter(ligne());
    await app.listen({ port: 0, host: '127.0.0.1' });
    try {
      const { port } = app.server.address() as net.AddressInfo;
      for (const octet of ['\t', '\x7f', '\x80', '\xe9', '\xff']) {
        expect(await brut(port, `${PREFIXE}/@aissa?q=a${octet}b`)).toMatch(/^HTTP\/1\.1 400 /);
      }
      for (const signe of ['"', '|', '{', '`', '%0d%0a']) {
        expect(await brut(port, `${PREFIXE}/@aissa?q=a${signe}b`)).toMatch(/^HTTP\/1\.1 307 /);
      }
    } finally {
      await app.close();
    }
  });

  it('par l’injection : tout caractère non ASCII arrive encodé et la redirection garde la requête', async () => {
    const app = await monter(ligne());
    for (const valeur of ['中', 'é', 'a\u0001b']) {
      const res = await app.inject({ method: 'GET', url: `${PREFIXE}/@aissa?q=${valeur}` });
      expect(res.statusCode).toBe(307);
      expect(res.headers.location).toBe(`${PREFIXE}/directory/people/aissa?q=${encodeURIComponent(valeur)}`);
    }
  });
});

describe('la ville déclarée est servie selon le cercle choisi par son propriétaire', () => {
  it.each([
    ['PUBLIC', null],
    ['ACQUAINTANCE', null],
    ['FRIEND', 'Dakar'],
    ['BLOOD', 'Dakar'],
  ])('lecteur de cercle %s avec cercle FRIEND choisi : %s', async (level, attendu) => {
    viewerLevel = level; viewerId = VIEWER;
    const app = await monter(ligne({ cityCircle: 'FRIEND' }));
    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/u/aissa` });
    const data = res.json().data;
    expect(data.city ?? null).toBe(attendu);
    expect('cityCircle' in data).toBe(false);
  });

  it('sans choix du propriétaire, personne d’autre que lui ne la lit', async () => {
    viewerLevel = 'BLOOD'; viewerId = VIEWER;
    const app = await monter(ligne({ cityCircle: null }));
    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/u/aissa` });
    expect(res.json().data.city).toBeUndefined();
  });

  it('le propriétaire lit sa ville ET son réglage', async () => {
    viewerId = OWNER;
    const app = await monter(ligne({ cityCircle: null }));
    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/u/aissa` });
    expect(res.json().data.city).toBe('Dakar');
    expect(res.json().data.cityCircle).toBeNull();
    viewerId = VIEWER;
  });

  it('une lecture de relation qui échoue ferme la VILLE, jamais la fiche', async () => {
    viewerLevel = 'BLOOD'; viewerId = VIEWER; relationReadFails = true;
    try {
      const app = await monter(ligne({ cityCircle: 'FRIEND' }));
      const res = await app.inject({ method: 'GET', url: `${PREFIXE}/u/aissa` });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.username).toBe('aissa');
      expect('city' in res.json().data).toBe(false);
    } finally {
      relationReadFails = false;
    }
  });

  it('un cercle PUBLIC sert la ville sans lecture de relation', async () => {
    viewerLevel = 'PUBLIC'; viewerId = VIEWER;
    const app = await monter(ligne({ cityCircle: 'PUBLIC' }));
    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/u/aissa` });
    expect(res.json().data.city).toBe('Dakar');
  });
});

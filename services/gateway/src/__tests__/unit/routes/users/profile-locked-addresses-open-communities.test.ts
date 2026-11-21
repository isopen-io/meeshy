/**
 * La face Liens d'un autre (#19274, chantier #18857) : la fiche dit combien de ses
 * adresses sont réservées à un cercle plus proche, sans rien en porter, et sert ses
 * communautés ouvertes.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

const OWNER = '507f1f77bcf86cd799439011';
const VIEWER = '507f1f77bcf86cd7994390fe';
let viewerId: string | null = VIEWER;
let viewerLevel = 'FRIEND';
let viewClosed = false;
let ownerState: { isActive: boolean; deletedAt: Date | null; deactivatedAt: Date | null } = { isActive: true, deletedAt: null, deactivatedAt: null };

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
    readProfileCircleView: async () =>
      viewClosed
        ? { isSelf: false, level: 'PUBLIC', sharesCommunity: false, capabilities: {} }
        : { isSelf: false, level: viewerLevel, grantedByViewer: viewerLevel, grantedByTarget: viewerLevel, sharesCommunity: false, capabilities: {} },
  };
});

import { getUserById, getUserByUsername } from '../../../../routes/users/profile';

type Address = { id: string; userId: string; title: string; url: string; glyph: string; circle: string; position: number; isShown: boolean; trackingToken: string | null };
type Community = { id: string; identifier: string; name: string; avatar: string | null; isPrivate: boolean; isActive: boolean; deletedAt: Date | null };
type Member = { userId: string; communityId: string; isActive: boolean };
type Pref = { userId: string; communityId: string; isHidden: boolean };

let addresses: Address[] = [];
let communities: Community[] = [];
let members: Member[] = [];
let prefs: Pref[] = [];

const adresse = (over: Partial<Address>): Address => ({
  id: 'ad', userId: OWNER, title: 'Site', url: 'https://aissandiaye.studio/', glyph: 'site', circle: 'PUBLIC',
  position: 0, isShown: true, trackingToken: null, ...over,
});
const communaute = (over: Partial<Community>): Community => ({
  id: 'c', identifier: 'mshy_c', name: 'C', avatar: null, isPrivate: false, isActive: true, deletedAt: null, ...over,
});
const membres = (communityId: string, n: number): Member[] =>
  Array.from({ length: n }, (_, i) => ({ userId: `${communityId}-m${i}`, communityId, isActive: true }));

const inList = (value: string, filter: any): boolean => filter === undefined || (typeof filter === 'string' ? filter === value : (filter.in as string[]).includes(value));

const prisma = () => ({
  user: {
    findUnique: jest.fn<any>(async () => ownerState),
    findFirst: jest.fn<any>(async (a?: any) => (a?.where?.blockedUserIds ? null : {
      id: OWNER, username: 'aissa', firstName: 'A', lastName: 'N', displayName: 'Aissa', avatar: null, banner: null,
      bio: '', role: 'USER', isOnline: false, lastActiveAt: null, createdAt: new Date('2026-01-01T00:00:00Z'), voiceModel: null,
    })),
  },
  profileAddress: {
    findMany: jest.fn<any>(async (a: any) => addresses
      .filter((r) => r.userId === a.where.userId && (a.where.isShown === undefined || r.isShown === a.where.isShown))
      .sort((x, y) => x.position - y.position)),
  },
  trackingLink: { findMany: jest.fn<any>(async () => []) },
  communityMember: {
    findMany: jest.fn<any>(async (a: any) => members.filter((m) =>
      inList(m.userId, a.where.userId) && inList(m.communityId, a.where.communityId) && (a.where.isActive === undefined || m.isActive === a.where.isActive))
      .slice(0, a.take ?? Infinity)
      .map((m) => ({ communityId: m.communityId }))),
  },
  userCommunityPreferences: {
    findMany: jest.fn<any>(async (a: any) => prefs.filter((p) =>
      p.userId === a.where.userId && inList(p.communityId, a.where.communityId) && (a.where.isHidden === undefined || p.isHidden === a.where.isHidden))
      .map((p) => ({ communityId: p.communityId }))),
  },
  community: {
    findMany: jest.fn<any>(async (a: any) => communities
      .filter((c) => inList(c.id, a.where.id) && (a.where.isPrivate === undefined || c.isPrivate === a.where.isPrivate) && (a.where.isActive === undefined || c.isActive === a.where.isActive))
      .slice(0, a.take ?? Infinity)
      .map((c) => ({ ...c, _count: { members: members.filter((m) => m.communityId === c.id && m.isActive).length } }))),
  },
});

let base: ReturnType<typeof prisma>;

async function monter(): Promise<FastifyInstance> {
  base = prisma();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', base as never);
  await app.register(async (i) => { await getUserById(i); await getUserByUsername(i); }, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

const fiche = async (url = `/api/v1/users/${OWNER}`) => {
  const res = await (await monter()).inject({ method: 'GET', url });
  expect(res.statusCode).toBe(200);
  return { data: res.json().data, body: res.body };
};

beforeEach(() => {
  viewerId = VIEWER; viewerLevel = 'FRIEND'; viewClosed = false;
  ownerState = { isActive: true, deletedAt: null, deactivatedAt: null };
  addresses = []; communities = []; members = []; prefs = [];
});

describe('lockedAddresses : ce qui est réservé à un cercle plus proche se compte, sans rien en porter', () => {
  const fichePleine = () => {
    addresses = [
      adresse({ id: 'pub', circle: 'PUBLIC', position: 0 }),
      adresse({ id: 'ami', circle: 'FRIEND', position: 1 }),
      adresse({ id: 'proche', circle: 'CLOSE', position: 2, title: 'Carnet intime', url: 'https://carnet-intime.example.org/', glyph: 'agenda', trackingToken: 'tokSecret' }),
      adresse({ id: 'sang', circle: 'BLOOD', position: 3, title: 'Coffre famille', url: 'https://coffre-famille.example.net/', glyph: 'photos' }),
      adresse({ id: 'sang2', circle: 'BLOOD', position: 4, title: 'Album', url: 'https://album.example.net/' }),
      adresse({ id: 'cachee', circle: 'BLOOD', position: 5, isShown: false }),
    ];
  };

  it('un Ami lit les adresses de son cercle, puis un compte par cercle plus proche', async () => {
    fichePleine();
    const { data } = await fiche();
    expect(data.addresses.map((a: any) => a.id)).toEqual(['pub', 'ami']);
    expect(data.lockedAddresses).toEqual([{ circle: 'CLOSE', count: 1 }, { circle: 'BLOOD', count: 2 }]);
  });

  it('rien de ce qui accompagne une adresse fermée ne part : ni titre, ni URL, ni hôte, ni glyphe, ni jeton, ni identifiant', async () => {
    fichePleine();
    const { body } = await fiche();
    for (const voisin of ['Carnet intime', 'carnet-intime', 'example.org', 'tokSecret', 'agenda', 'Coffre famille', 'coffre-famille', 'album.example', '"proche"', '"sang"', '"sang2"', '"cachee"']) {
      expect(body).not.toContain(voisin);
    }
  });

  it('un Proche ne voit verrouillé que ce qui est au-dessus du sien', async () => {
    fichePleine();
    viewerLevel = 'CLOSE';
    const { data } = await fiche(`/api/v1/u/aissa`);
    expect(data.addresses.map((a: any) => a.id)).toEqual(['pub', 'ami', 'proche']);
    expect(data.lockedAddresses).toEqual([{ circle: 'BLOOD', count: 2 }]);
  });

  it('un Sang lit tout : aucun compte verrouillé (champ absent)', async () => {
    fichePleine();
    viewerLevel = 'BLOOD';
    const { data } = await fiche();
    expect('lockedAddresses' in data).toBe(false);
  });

  it('toutes ses adresses sont fermées au lecteur : aucune adresse servie, mais le compte part', async () => {
    addresses = [adresse({ id: 'sang', circle: 'BLOOD' })];
    viewerLevel = 'COMMUNITY';
    const { data } = await fiche();
    expect('addresses' in data).toBe(false);
    expect(data.lockedAddresses).toEqual([{ circle: 'BLOOD', count: 1 }]);
  });

  it('un lecteur qui ne peut atteindre aucun cercle (blocage, compte désactivé) ne lit aucun compte', async () => {
    fichePleine();
    viewClosed = true;
    const { data } = await fiche();
    expect(data.addresses.map((a: any) => a.id)).toEqual(['pub']);
    expect('lockedAddresses' in data).toBe(false);
  });

  it('le propriétaire lit tout : aucun compte verrouillé', async () => {
    fichePleine();
    viewerId = OWNER;
    const { data } = await fiche();
    expect(data.addresses).toHaveLength(5);
    expect('lockedAddresses' in data).toBe(false);
  });

  it('propriétaire désactivé : ni adresse ni compte', async () => {
    fichePleine();
    ownerState = { isActive: true, deletedAt: null, deactivatedAt: new Date('2026-11-01') };
    const { data } = await fiche();
    expect('addresses' in data).toBe(false);
    expect('lockedAddresses' in data).toBe(false);
  });

  it('?fields= sans les adresses : aucun compte ; avec lockedAddresses seul : le compte, sans les adresses', async () => {
    fichePleine();
    const sans = await fiche(`/api/v1/users/${OWNER}?fields=username`);
    expect('lockedAddresses' in sans.data).toBe(false);
    const seul = await fiche(`/api/v1/users/${OWNER}?fields=lockedAddresses`);
    expect(seul.data.lockedAddresses).toEqual([{ circle: 'CLOSE', count: 1 }, { circle: 'BLOOD', count: 2 }]);
    expect('addresses' in seul.data).toBe(false);
  });
});

describe('openCommunities : ses communautés ouvertes, telles qu’il les montre', () => {
  const peupler = () => {
    communities = [
      communaute({ id: 'paris', identifier: 'mshy_meeshy-paris', name: 'Meeshy Paris', avatar: 'https://cdn/paris.png' }),
      communaute({ id: 'dakar', identifier: 'mshy_dakar', name: 'Dakar' }),
      communaute({ id: 'secret', identifier: 'mshy_secret', name: 'Cercle secret', isPrivate: true }),
      communaute({ id: 'morte', identifier: 'mshy_morte', name: 'Fermée', isActive: false }),
      communaute({ id: 'effacee', identifier: 'mshy_effacee', name: 'Effacée', deletedAt: new Date('2026-10-01') }),
      communaute({ id: 'cachee', identifier: 'mshy_cachee', name: 'Cachée par lui' }),
      communaute({ id: 'partie', identifier: 'mshy_partie', name: 'Quittée' }),
    ];
    members = [
      ...['paris', 'dakar', 'secret', 'morte', 'effacee', 'cachee'].map((communityId) => ({ userId: OWNER, communityId, isActive: true })),
      { userId: OWNER, communityId: 'partie', isActive: false },
      { userId: VIEWER, communityId: 'dakar', isActive: true },
      { userId: VIEWER, communityId: 'paris', isActive: false },
      ...membres('paris', 1203),
      ...membres('dakar', 41),
    ];
    prefs = [{ userId: OWNER, communityId: 'cachee', isHidden: true }];
  };

  it('sert ses communautés publiques et actives, la plus peuplée d’abord, avec l’effectif actif et l’appartenance du lecteur', async () => {
    peupler();
    const { data } = await fiche();
    expect(data.openCommunities).toEqual([
      { id: 'paris', identifier: 'mshy_meeshy-paris', name: 'Meeshy Paris', avatar: 'https://cdn/paris.png', memberCount: 1204, isMember: false },
      { id: 'dakar', identifier: 'mshy_dakar', name: 'Dakar', avatar: null, memberCount: 43, isMember: true },
    ]);
  });

  it('rien d’une communauté privée, fermée, effacée, quittée ou qu’il cache de sa liste ne part', async () => {
    peupler();
    const { body } = await fiche();
    for (const voisin of ['Cercle secret', 'mshy_secret', 'Fermée', 'Effacée', 'Cachée par lui', 'mshy_cachee', 'Quittée']) {
      expect(body).not.toContain(voisin);
    }
  });

  it('le propriétaire lit ses communautés ouvertes, toutes « membre »', async () => {
    peupler();
    viewerId = OWNER;
    const { data } = await fiche();
    expect(data.openCommunities.map((c: any) => [c.id, c.isMember])).toEqual([['paris', true], ['dakar', true]]);
  });

  it('aucune communauté ouverte : le champ est absent (le client se tait)', async () => {
    const { data } = await fiche();
    expect('openCommunities' in data).toBe(false);
  });

  it('propriétaire désactivé : aucune communauté servie', async () => {
    peupler();
    ownerState = { isActive: false, deletedAt: null, deactivatedAt: null };
    const { data } = await fiche();
    expect('openCommunities' in data).toBe(false);
  });

  it('?fields= qui ne la nomme pas : aucune lecture des appartenances', async () => {
    peupler();
    const { data } = await fiche(`/api/v1/users/${OWNER}?fields=username`);
    expect('openCommunities' in data).toBe(false);
    expect(base.communityMember.findMany).not.toHaveBeenCalled();
  });

  it('servie aussi par l’alias /u/:username, à l’identique', async () => {
    peupler();
    const { data } = await fiche('/api/v1/u/aissa');
    expect(data.openCommunities.map((c: any) => c.id)).toEqual(['paris', 'dakar']);
  });
});

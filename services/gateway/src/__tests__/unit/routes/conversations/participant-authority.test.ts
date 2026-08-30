/**
 * **Agir SUR quelqu'un : le rang de la CIBLE entre enfin dans la décision.**
 *
 * Quatre gestes changent l'appartenance d'un participant — le retirer, changer
 * son rang, le bannir, lever son bannissement. Un seul lisait le rang de sa
 * cible (`/ban`). Ce que les trois autres coûtaient, mesuré sur le dépôt du
 * 2026-08-29 :
 *
 *   - `DELETE …/participants/:key` exigeait `MODERATOR` **et rien d'autre** : un
 *     modérateur sortait un administrateur, et jusqu'au CRÉATEUR. La
 *     conversation était expropriable par n'importe lequel de ses modérateurs —
 *     alors que RÉTROGRADER ce même créateur était refusé depuis #4008. Le geste
 *     le plus destructeur était le moins gardé.
 *   - `PATCH …/role` exigeait `ADMIN` : un administrateur rétrogradait ses
 *     pairs. La protection du créateur y était une EXCEPTION nommée là où il
 *     fallait une loi.
 *   - `/unban` exigeait `ADMIN` quand `/ban` se contentait d'un rang supérieur :
 *     **un modérateur posait un bannissement qu'il ne pouvait pas lever.**
 *
 * Les témoins ci-dessous visent la LOI (`participantActionRefusal`) à travers
 * ses quatre sites, jamais la fonction seule : c'est le câblage qui manquait,
 * pas l'arithmétique.
 *
 * Le double Prisma répond au `where` — un double qui rend la même ligne à toutes
 * les questions ferait croire au handler que l'appelant se vise lui-même, et
 * laisserait passer exactement les défauts mesurés ici.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

const CONV_ID = '507f1f77bcf86cd799439033';
const CALLER_ID = '507f1f77bcf86cd799439011';
const TARGET_ID = '507f1f77bcf86cd799439022';
const ANON_PARTICIPANT_ID = '507f1f77bcf86cd7994390cc';
const SHARE_LINK_ID = '507f1f77bcf86cd7994390dd';

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn(async () => CONV_ID),
  invalidateConversationIdCache: jest.fn(),
}));

jest.mock('../../../../utils/participant-lookup-cache', () => ({
  invalidateParticipantLookup: jest.fn(),
}));

jest.mock('../../../../socketio/endConversationMembership', () => ({
  endConversationMembership: jest.fn(async () => undefined),
}));

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTarget: async () => ({ showOnline: false, showLastSeenTimestamp: false }),
    resolveForTargets: async () => new Map(),
  }),
}));

import { registerParticipantRemovalRoute } from '../../../../routes/conversations/participant-removal';
import { registerParticipantRoleRoute } from '../../../../routes/conversations/participant-role';
import { registerBanRoutes } from '../../../../routes/conversations/ban';

// ─── Doubles ──────────────────────────────────────────────────────────────────

type Row = {
  id: string;
  userId: string | null;
  role: string;
  isActive?: boolean;
  leftAt?: Date | null;
  bannedAt?: Date | null;
  displayName?: string | null;
  shareLinkId?: string | null;
  type?: string;
};

const filled = (row: Row) => ({
  conversationId: CONV_ID,
  isActive: true,
  leftAt: null,
  bannedAt: null,
  displayName: 'Nom',
  shareLinkId: null,
  type: 'user',
  permissions: {},
  joinedAt: new Date('2026-01-01'),
  ...row,
  user: row.userId
    ? {
        id: row.userId,
        username: 'u',
        displayName: 'U',
        firstName: 'U',
        lastName: 'U',
        avatar: null,
        role: 'USER',
        isOnline: false,
        lastActiveAt: null,
        systemLanguage: 'fr',
        regionalLanguage: 'en',
        customDestinationLanguage: null,
        isActive: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        deactivatedAt: null,
      }
    : null,
});

/**
 * Répond au `where`, comme la vraie requête : `userId` d'abord (le cas courant),
 * `id` ensuite — c'est exactement la question que pose `resolveTargetParticipant`
 * quand la première ne rend rien, et c'est elle qui atteint un visiteur sans
 * compte.
 */
function makePrisma(rows: Row[]) {
  const full = rows.map(filled);
  const writes: { where: any; data: any }[] = [];
  const matches = (row: any, where: any) =>
    (where.userId === undefined || row.userId === where.userId) &&
    (where.id === undefined || row.id === where.id) &&
    (where.isActive === undefined || row.isActive === where.isActive);

  return {
    writes,
    participant: {
      findFirst: jest.fn(async ({ where }: any) => full.find((row) => matches(row, where)) ?? null),
      findUnique: jest.fn(async ({ where }: any) => full.find((row) => row.id === where.id) ?? null),
      // L'écriture MUTE la ligne stockée. Un double qui garde la ligne intacte
      // laisse `findMany` rendre le retiré parmi les membres actifs — et le
      // témoin d'audience passe alors au vert sans que la route ait rien
      // chaîné pour lui.
      update: jest.fn(async ({ where, data }: any) => {
        writes.push({ where, data });
        const row = full.find((r) => r.id === where.id);
        Object.assign(row as object, data);
        return row;
      }),
      findMany: jest.fn(async () =>
        full
          .filter((row) => row.isActive)
          .map((row) => ({ id: row.id, userId: row.userId, role: row.role, user: { role: 'USER' } })),
      ),
    },
    conversationShareLink: { update: jest.fn(async () => ({ id: SHARE_LINK_ID, isActive: false })) },
  };
}

type Emitted = { rooms: string[]; event: string; payload: any };

function makeSocket(emitted: Emitted[]) {
  const chain = (rooms: string[]): any => ({
    to: (room: string) => chain([...rooms, room]),
    emit: (event: string, payload: any) => emitted.push({ rooms, event, payload }),
  });
  const io = {
    to: (room: string) => chain([room]),
    in: () => ({ fetchSockets: async () => [] }),
  };
  return {
    getIO: () => io,
    invalidateParticipantCache: jest.fn(),
    joinUserToConversationRoom: jest.fn(async () => undefined),
  };
}

async function buildApp(prisma: any, emitted: Emitted[] = []): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const requiredAuth = async (req: FastifyRequest) => {
    (req as any).authContext = {
      type: 'user',
      isAuthenticated: true,
      isAnonymous: false,
      userId: CALLER_ID,
      registeredUser: { id: CALLER_ID, role: 'USER' },
    };
  };
  app.decorate('socketIOHandler', { getManager: () => makeSocket(emitted) } as any);
  registerParticipantRemovalRoute(app, prisma, requiredAuth);
  registerParticipantRoleRoute(app, prisma, requiredAuth);
  registerBanRoutes(app, prisma, jest.fn(), requiredAuth);
  await app.ready();
  return app;
}

const caller = (role: string): Row => ({ id: 'part-caller', userId: CALLER_ID, role });
const target = (role: string, over: Partial<Row> = {}): Row =>
  ({ id: 'part-target', userId: TARGET_ID, role, displayName: 'Bob', ...over });

// ─── DELETE …/participants/:key — le rang de la cible la protège ──────────────

describe('DELETE …/participants/:key — un modérateur n\'atteint plus ce qui est au-dessus de lui', () => {
  it('refuse à un modérateur de retirer un ADMIN', async () => {
    const prisma = makePrisma([caller('moderator'), target('admin')]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}` });

    expect(res.statusCode).toBe(403);
    // Le refus doit être ANTÉRIEUR à l'écriture : une garde qui répond 403
    // après avoir désactivé la ligne n'a rien gardé.
    expect(prisma.participant.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse à un modérateur de retirer le CRÉATEUR de la conversation', async () => {
    const prisma = makePrisma([caller('moderator'), target('creator')]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}` });

    expect(res.statusCode).toBe(403);
    expect(prisma.participant.update).not.toHaveBeenCalled();
    await app.close();
  });

  // Le pendant OBLIGATOIRE : une garde qui refuse tout est verte sur les deux
  // témoins ci-dessus sans rien garder du tout.
  it('laisse le modérateur retirer un membre — la garde borne, elle ne ferme pas', async () => {
    const prisma = makePrisma([caller('moderator'), target('member')]);
    const app = await buildApp(prisma);

    const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}` });

    expect(res.statusCode).toBe(200);
    expect(prisma.writes).toEqual([
      { where: { id: 'part-target' }, data: { isActive: false, leftAt: expect.any(Date) } },
    ]);
    await app.close();
  });
});

// ─── L'effet de bord, qu'une extraction perd en silence ───────────────────────

describe('DELETE …/participants/:key — la diffusion garde son audience', () => {
  it('chaîne la room du fil, les rooms personnelles des restants ET celle du retiré', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma([caller('admin'), target('member')]);
    const app = await buildApp(prisma, emitted);

    await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/participants/${TARGET_ID}` });

    const left = emitted.find((e) => e.event === 'conversation:participant-left');
    expect(left).toBeDefined();
    // Le retiré est sur l'écran de LISTE, hors de la room du fil : sans sa room
    // personnelle il garde une ligne que `GET /conversations` ne sert plus.
    expect(left?.rooms).toEqual(expect.arrayContaining([`conversation:${CONV_ID}`, `user:${TARGET_ID}`, `user:${CALLER_ID}`]));
    expect(left?.payload).toEqual(expect.objectContaining({
      conversationId: CONV_ID,
      participantId: 'part-target',
      userId: TARGET_ID,
    }));
    await app.close();
  });
});

// ─── PATCH …/role — un admin ne rétrograde plus ses pairs ─────────────────────

describe('PATCH …/participants/:key/role — le rang de la cible entre dans la décision', () => {
  it('refuse à un ADMIN de rétrograder un autre ADMIN', async () => {
    const prisma = makePrisma([caller('admin'), target('admin')]);
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'PATCH',
      url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/role`,
      payload: { role: 'member' },
    });

    expect(res.statusCode).toBe(403);
    expect(prisma.participant.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('laisse l\'ADMIN rétrograder un modérateur — la garde borne, elle ne ferme pas', async () => {
    const prisma = makePrisma([caller('admin'), target('moderator')]);
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'PATCH',
      url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/role`,
      payload: { role: 'member' },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.writes).toEqual([{ where: { id: 'part-target' }, data: { role: 'member' } }]);
    await app.close();
  });
});

// ─── La clé : DEUX colonnes, et le témoin vise ce qui les DISTINGUE ───────────

describe('PATCH …/participants/:key/role — la clé résout les deux colonnes', () => {
  /**
   * Le témoin vise un participant **SANS COMPTE**, et c'est la seule forme qui
   * prouve quoi que ce soit : sur un membre inscrit, `User.id` et
   * `Participant.id` mènent tous deux à une ligne et le témoin passerait au vert
   * sur le code d'AVANT.
   *
   * Un visiteur de lien partagé n'a AUCUNE ligne `User` : son `Participant.id`
   * est sa seule identité, et le `findFirst` sur la colonne `userId` ne le
   * trouvait jamais. La route répondait « participant introuvable » — ce qui est
   * FAUX : il existe, la question était mal posée.
   *
   * Elle répond désormais ce qui est vrai : la ligne est trouvée, et le rang lui
   * est refusé pour une raison NOMMÉE — l'événement qui annonce un changement de
   * rang déclare `userId` non optionnel chez les trois clients, et y émettre
   * `null` ferait perdre l'événement ENTIER (#4009), pas seulement ce champ.
   */
  it('atteint un visiteur sans compte et le refuse pour la VRAIE raison, plus par un 404 qui ment', async () => {
    const prisma = makePrisma([
      caller('admin'),
      { id: ANON_PARTICIPANT_ID, userId: null, role: 'member', type: 'anonymous', shareLinkId: SHARE_LINK_ID },
    ]);
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'PATCH',
      url: `/conversations/${CONV_ID}/participants/${ANON_PARTICIPANT_ID}/role`,
      payload: { role: 'moderator' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error?.code ?? res.json().code).toBe('PARTICIPANT_HAS_NO_ACCOUNT');
    expect(prisma.participant.update).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── Bannir / lever : une seule loi, dans les deux sens ───────────────────────

describe('Lever un bannissement s\'autorise comme le poser', () => {
  it('le modérateur lève le bannissement qu\'il aurait pu poser', async () => {
    const prisma = makePrisma([caller('moderator'), target('member', { bannedAt: new Date('2026-08-01'), isActive: false, leftAt: new Date('2026-08-01') })]);
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'PATCH',
      url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/unban`,
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.writes[0]?.data).toEqual(expect.objectContaining({ bannedAt: null }));
    await app.close();
  });

  it('mais un ADMIN ne libère pas un ADMIN banni : seul qui pouvait le bannir le relève', async () => {
    const prisma = makePrisma([caller('admin'), target('admin', { bannedAt: new Date('2026-08-01'), isActive: false })]);
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'PATCH',
      url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/unban`,
      payload: {},
    });

    expect(res.statusCode).toBe(403);
    expect(prisma.participant.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('et bannir demande le TITRE avant la portée : un simple membre n\'atteint plus une ligne au rang illisible', async () => {
    // Rang illisible ⇒ niveau 0. La seule comparaison des rangs laissait un
    // MEMBRE (niveau 10) bannir cette ligne : le plancher manquait.
    const prisma = makePrisma([caller('member'), target('rang-herite-illisible')]);
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'PATCH',
      url: `/conversations/${CONV_ID}/participants/${TARGET_ID}/ban`,
      payload: {},
    });

    expect(res.statusCode).toBe(403);
    expect(prisma.participant.update).not.toHaveBeenCalled();
    await app.close();
  });
});

// ─── La charge des deux routes est enfin GOUVERNÉE ────────────────────────────

describe('PATCH …/ban — la réponse 200 est déclarée', () => {
  /**
   * `/ban` et `/unban` n'avaient AUCUN schéma de réponse : leur charge n'était
   * gouvernée par rien. Le témoin porte sur la seule forme qu'un schéma peut
   * casser sans qu'on s'en aperçoive — `userId: null`, l'identité d'un visiteur
   * sans compte. Un `type: 'string'` sans `nullable` ne rend pas `null` : il
   * rend `""`, et un client qui teste `userId == null` retire alors la mauvaise
   * ligne.
   */
  it('sert `participantId` toujours et `userId: null` pour un visiteur sans compte', async () => {
    const prisma = makePrisma([
      caller('admin'),
      { id: ANON_PARTICIPANT_ID, userId: null, role: 'member', type: 'anonymous', shareLinkId: SHARE_LINK_ID },
    ]);
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'PATCH',
      url: `/conversations/${CONV_ID}/participants/${ANON_PARTICIPANT_ID}/ban`,
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      participantId: ANON_PARTICIPANT_ID,
      userId: null,
      bannedAt: expect.any(String),
      closedShareLinkId: SHARE_LINK_ID,
    });
    await app.close();
  });
});

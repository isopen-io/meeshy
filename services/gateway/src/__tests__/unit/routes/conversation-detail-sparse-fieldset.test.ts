/**
 * `GET /conversations/{id}` — `?fields=`, et ce qu'il ÉCONOMISE en amont (#4173).
 *
 * ## Ce que ces témoins gardent, et pourquoi la forme de la réponse ne suffit pas
 *
 * Le critère 5 (a) de #4173 le dit en une phrase : « un test qui n'asserte que
 * la forme de la sortie reste vert si le serveur charge tout puis filtre à la
 * sérialisation, ce qui n'économise rien en amont ». Le dépôt écrit déjà la
 * même chose pour la descente du Prisme — « le `select` est le seul des trois
 * qu'aucun témoin de rang ne peut voir ». Les témoins décisifs de ce fichier
 * lisent donc l'ARGUMENT passé au double Prisma, pas le corps rendu.
 *
 * `@meeshy/shared/types/api-schemas` n'est PAS mocké : le contrat de fil
 * (`conversationResponseSchema`, et `fast-json-stringify` derrière lui) fait
 * partie de ce qu'on mesure — c'est lui qui décide ce qu'une projection atteint
 * réellement, et un schéma mocké rendrait le témoin aveugle au seul endroit qui
 * compte.
 *
 * `conditionalGetOnSend` est monté ici comme il l'est dans `server.ts` : l'ETag
 * de cette route n'est pas calculé par elle mais par ce crochet, depuis les
 * OCTETS SÉRIALISÉS. C'est ce qui fait que deux projections ne peuvent pas
 * partager un validateur — et c'est ce que le critère 6 demande de prouver
 * plutôt que de déduire.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439aaa';

const mockResolveConversationId = jest.fn<any>().mockResolvedValue(CONV_ID);
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...a: any[]) => mockResolveConversationId(...a),
}));

const mockCanAccess = jest.fn<any>().mockResolvedValue(true);
const mockResolveCallerParticipant = jest.fn<any>().mockResolvedValue({ id: 'p-1', role: 'admin' });
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...a: any[]) => mockCanAccess(...a),
  resolveCallerParticipant: (...a: any[]) => mockResolveCallerParticipant(...a),
}));

const mockGetUnreadCount = jest.fn<any>().mockResolvedValue(7);
jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: class {
    getUnreadCount(...a: any[]) { return mockGetUnreadCount(...a); }
  },
}));

const mockResolveForTargets = jest.fn<any>().mockResolvedValue(new Map());
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: (...a: any[]) => mockResolveForTargets(...a) }),
}));

jest.mock('../../../routes/users/presence-gate', () => ({
  viewerFromRequest: () => ({ id: USER_ID, role: 'USER' }),
  presenceFor: () => ({ showOnline: false, showLastSeenTimestamp: false }),
}));

import { registerConversationDetailRoute } from '../../../routes/conversations/core-detail';
import { conversationSchema } from '@meeshy/shared/types/api-schemas';
import { conditionalGetOnSend } from '../../../utils/etag';

const ROW = () => ({
  id: CONV_ID,
  identifier: 'mee_demo',
  type: 'group',
  title: 'Le salon',
  description: 'une description',
  avatar: null,
  banner: null,
  communityId: null,
  isActive: true,
  lastMessageAt: new Date('2026-08-01T10:00:00Z'),
  defaultWriteRole: 'everyone',
  isAnnouncementChannel: false,
  slowModeSeconds: 0,
  createdAt: new Date('2026-07-01T10:00:00Z'),
  updatedAt: new Date('2026-08-01T10:00:00Z'),
  encryptionMode: null,
  encryptionProtocol: null,
  encryptionEnabledAt: null,
  encryptionEnabledBy: null,
  serverEncryptionKeyId: null,
  autoTranslateEnabled: true,
  participants: [
    {
      id: 'p-1', userId: USER_ID, type: 'user', displayName: 'Ana', avatar: null,
      role: 'admin', permissions: null, isActive: true, isOnline: true,
      lastActiveAt: null, joinedAt: new Date('2026-07-01T10:00:00Z'),
      user: { id: USER_ID, username: 'ana', displayName: 'Ana', firstName: 'Ana', lastName: 'B' },
    },
  ],
  _count: { participants: 3 },
});

function makePrisma() {
  return {
    conversation: { findFirst: jest.fn<any>().mockResolvedValue(ROW()) },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  } as any;
}

async function buildApp(prisma: any): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  // Le crochet d'ETag GLOBAL, monté comme dans `server.ts` : c'est lui, et pas
  // la route, qui pose le validateur de `/conversations/:id`.
  app.addHook('onSend', conditionalGetOnSend);
  app.decorate('notificationService', { markConversationNotificationsAsRead: async () => undefined } as never);
  app.decorate('presenceChecker', undefined as never);
  const optionalAuth = async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };
  registerConversationDetailRoute(app, prisma, optionalAuth);
  await app.ready();
  return app;
}

const selectOf = (prisma: any): Record<string, unknown> =>
  prisma.conversation.findFirst.mock.calls[0][0].select as Record<string, unknown>;

beforeEach(() => {
  mockResolveCallerParticipant.mockClear();
  mockGetUnreadCount.mockClear();
  mockResolveForTargets.mockClear();
});

describe('#4173 c.5(a) — `fields` réduit la REQUÊTE, pas seulement la réponse', () => {
  it('sans `fields`, la requête charge le profil par DÉFAUT — un `select` fermé, jamais la ligne entière', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}` });

    const call = prisma.conversation.findFirst.mock.calls[0][0];
    // Un `include` charge TOUTES les colonnes scalaires de la table ; un
    // `select` ne charge que celles qu'il nomme. C'est l'inversion du critère 3
    // appliquée à la REQUÊTE, la seule que les clients publiés tolèrent.
    expect(call.include).toBeUndefined();
    expect(call.select).toBeDefined();
    await app.close();
  });

  it('`fields=id,type` RÉTRÉCIT le `select` — les colonnes non demandées ne sont plus lues', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}?fields=id,type` });

    const select = selectOf(prisma);
    expect(Object.keys(select).sort()).toEqual(['id', 'type']);
    for (const colonne of ['description', 'avatar', 'banner', 'encryptionMode', 'autoTranslateEnabled']) {
      expect(select[colonne]).toBeUndefined();
    }
    await app.close();
  });

  it('le `select` par DÉFAUT reste strictement plus large que celui d’une projection', async () => {
    const complet = makePrisma();
    const appComplet = await buildApp(complet);
    await appComplet.inject({ method: 'GET', url: `/conversations/${CONV_ID}` });
    await appComplet.close();

    const restreint = makePrisma();
    const appRestreint = await buildApp(restreint);
    await appRestreint.inject({ method: 'GET', url: `/conversations/${CONV_ID}?fields=id,type` });
    await appRestreint.close();

    expect(Object.keys(selectOf(restreint)).length).toBeLessThan(Object.keys(selectOf(complet)).length);
  });
});

describe('#4173 c.5(c) — une relation non citée n’est PAS chargée', () => {
  it('`fields=id,type` n’ouvre NI `participants` NI `_count`', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}?fields=id,type` });

    const select = selectOf(prisma);
    expect(select.participants).toBeUndefined();
    expect(select._count).toBeUndefined();
    await app.close();
  });

  it('`fields=id,participants` la borne au plafond partagé — jamais un roster illimité', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}?fields=id,participants` });

    const participants = selectOf(prisma).participants as { take: number; where: unknown };
    expect(participants.take).toBe(100);
    expect(participants.where).toEqual({ isActive: true });
    await app.close();
  });

  it('`fields=title` PAIE ses participants — un titre de groupe est COMPOSÉ d’eux', async () => {
    // Le coût déclaré d'une clé servie n'est pas toujours sa colonne homonyme :
    // le titre par défaut d'un groupe se compose des noms de ses membres
    // (`generateDefaultConversationTitle`). Le plan le DIT, plutôt que de servir
    // un titre nul en silence.
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}?fields=title` });

    expect(selectOf(prisma).participants).toBeDefined();
    await app.close();
  });
});

describe('#4173 c.5(b) — 400 explicite sur un champ non déclaré', () => {
  it('refuse, et NOMME le jeton fautif', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}?fields=id,emial` });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(JSON.stringify(body)).toContain('emial');
    await app.close();
  });

  it('ne lit RIEN en base avant de refuser — un refus de projection précède la requête', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}?fields=emial` });

    expect(prisma.conversation.findFirst).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('#4173 c.2 — la liste blanche est FERMÉE, jamais une préférence', () => {
  it('un champ que la ressource ne sert pas est REFUSÉ, jamais fabriqué', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    // `serverEncryptionKeyId` est servi ; `encryptionKey` n'existe pas.
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}?fields=encryptionKey` });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('une colonne chargée POUR UNE AUTRE clé ne fuit pas dans la réponse', async () => {
    // `title` charge `type` (il en dépend). `type` n'a pas été DEMANDÉ : il ne
    // doit pas sortir. C'est la distinction « chargé » / « servi » que la loi
    // porte, et le seul témoin qui la voie.
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}?fields=title` });

    expect(selectOf(prisma).type).toBeDefined();
    expect(res.json().data).not.toHaveProperty('type');
    expect(res.json().data.title).toBe('Le salon');
    await app.close();
  });

  it('`id` survit à toute projection — sans lui la réponse ne dit plus de quoi elle parle', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}?fields=title` });
    expect(res.json().data.id).toBe(CONV_ID);
    await app.close();
  });
});

describe('#4173 c.4 — une agrégation non demandée n’est pas CALCULÉE', () => {
  it('`fields=id,type` ne paie NI la résolution du participant NI le compteur de non-lus', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}?fields=id,type` });

    // Le témoin compte les REQUÊTES, pas les champs de la réponse : c'est la
    // seule mesure qui distingue « non servi » de « non calculé ».
    expect(mockResolveCallerParticipant).toHaveBeenCalledTimes(0);
    expect(mockGetUnreadCount).toHaveBeenCalledTimes(0);
    await app.close();
  });

  it('sans `fields`, les DEUX agrégations sont payées — le défaut n’a pas changé', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}` });

    expect(mockResolveCallerParticipant).toHaveBeenCalledTimes(1);
    expect(mockGetUnreadCount).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('`fields=id,currentUserRole` paie le rang mais PAS le compteur de non-lus', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}?fields=id,currentUserRole` });

    expect(mockResolveCallerParticipant).toHaveBeenCalledTimes(1);
    expect(mockGetUnreadCount).toHaveBeenCalledTimes(0);
    await app.close();
  });

  it('`fields=title` CHARGE les participants sans payer la résolution de PRÉSENCE', async () => {
    // Deux conditions distinctes, et il faut les deux : `title` charge les
    // participants (il en compose le titre par défaut) sans les SERVIR.
    // Résoudre la visibilité d'une liste que personne ne recevra serait une
    // requête pour un résultat jeté — et ne pas la servir est plus FERMÉ que la
    // servir masquée, donc la garde n'est pas assouplie.
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}?fields=title` });

    expect(selectOf(prisma).participants).toBeDefined();
    expect(mockResolveForTargets).toHaveBeenCalledTimes(0);
    expect(res.json().data).not.toHaveProperty('participants');
    await app.close();
  });

  it('`fields=id,participants` paie la résolution de présence — elle porte la garde', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}?fields=id,participants` });

    expect(mockResolveForTargets).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('`fields=id,memberCount` ouvre le `_count` et paie le rang qui décide du plafond', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}?fields=id,memberCount` });

    expect(selectOf(prisma)._count).toBeDefined();
    expect(mockResolveCallerParticipant).toHaveBeenCalledTimes(1);
    expect(res.json().data.memberCount).toBe(3);
    await app.close();
  });
});

describe('#4173 c.6 — l’ETag distingue DEUX projections', () => {
  it('un `If-None-Match` pris sous `fields=id,type` ne rend PAS 304 sous `fields=id,type,title`', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const etroit = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}?fields=id,type` });
    expect(etroit.statusCode).toBe(200);
    const etag = etroit.headers.etag as string;
    expect(etag).toBeTruthy();

    const large = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}?fields=id,type,title`,
      headers: { 'if-none-match': etag },
    });

    expect(large.statusCode).toBe(200);
    expect(large.json().data.title).toBe('Le salon');
    await app.close();
  });

  it('la MÊME projection rend bien 304 — le validateur reste utile', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const premier = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}?fields=id,type` });
    const second = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}?fields=id,type`,
      headers: { 'if-none-match': premier.headers.etag as string },
    });

    expect(second.statusCode).toBe(304);
    await app.close();
  });
});

describe('#4173 c.7 — le défaut n’est PAS inversé sur cette ressource', () => {
  it('sans `fields`, la réponse porte tout ce qu’elle portait — les trois clients ne demandent rien', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}` });

    const data = res.json().data;
    // `id`, `type` et `createdAt` sont NON-OPTIONNELS dans `APIConversation`
    // (packages/MeeshySDK/.../ConversationModels.swift) : leur absence fait
    // échouer le décodage iOS ENTIER, pas seulement le champ. Un défaut maigre
    // ici ne dégraderait pas l'écran, il l'empêcherait de s'ouvrir.
    for (const cle of ['id', 'type', 'createdAt', 'title', 'participants', 'memberCount', 'unreadCount', 'currentUserRole']) {
      expect(data).toHaveProperty(cle);
    }
    await app.close();
  });
});

describe('#4173 — ce que la route CHARGEAIT sans jamais le SERVIR', () => {
  it('`conversationSchema` ne déclare aucun `userPreferences` — donc la requête ne doit pas l’ouvrir', async () => {
    // Le contrat de fil est la mesure : `fast-json-stringify` applique
    // `additionalProperties: false`, donc une relation absente du schéma est
    // strippée avant d'atteindre le moindre client. La charger était du travail
    // MORT — une jointure par ouverture de conversation, sur les trois clients.
    expect(conversationSchema.properties).not.toHaveProperty('userPreferences');

    const prisma = makePrisma();
    const app = await buildApp(prisma);
    await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}` });

    expect(selectOf(prisma).userPreferences).toBeUndefined();
    await app.close();
  });
});

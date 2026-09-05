/**
 * #4662 — les sites qui dérivent une LANGUE d'un compte descendent le Prisme,
 * et ils le font par LE MÊME SITE (`utils/recipient-language.ts`).
 *
 * ## Ce que le dépôt portait, MESURÉ avant d'écrire une ligne
 *
 * L'issue annonce « quatre producteurs de `Participant.language` ». Le
 * balayage des écritures Prisma vers cette colonne en rend UN SEUL parmi les
 * quatre nommés — et c'est ce qui décide de la forme de ce fichier :
 *
 * | site nommé par l'issue | ce qu'il alimente RÉELLEMENT | règle |
 * |---|---|---|
 * | `services/messaging/MessagingService.ts` | `Participant.language` | les quatre rangs |
 * | `routes/conversations/participants-writes.ts` | `Participant.language` | rang 1 nu |
 * | `routes/conversations/sharing.ts` | le GATE `allowedLanguages` | rang 1 nu |
 * | `services/AuthService.ts` | la langue d'un E-MAIL | rang 1 nu |
 *
 * `sharing.ts` ne touche pas la colonne : `performLinkJoin` ne remet PAS son
 * `profile` à `joinAsRegistered`, si bien que sa langue ne sert qu'à juger
 * `allowedLanguages`. Le défaut y est donc un REFUS, pas une mauvaise cible de
 * traduction — un lecteur dont la langue admise vit au rang 2, 3 ou 4 se voyait
 * opposer le repli du site. Les deux sites gardés ici sont ceux que ce lot
 * corrige ; `AuthService` est hors périmètre, et le rapport de livraison dit
 * pourquoi.
 *
 * ## Pourquoi chaque témoin est écrit sur un rang AUTRE que le premier
 *
 * Au rang 1, `user.systemLanguage ?? 'xx'` et la descente rendent le MÊME
 * verdict : un témoin posé là ne peut pas tomber, et décore au lieu de mesurer
 * (leçon 261, et § « un témoin de RANG s'écrit sur un rang AUTRE que le
 * premier » du `CLAUDE.md` de ce service). Le premier `describe` MESURE cette
 * indiscernabilité plutôt que de l'affirmer — c'est lui qui justifie le choix
 * des rangs de tous les autres.
 *
 * ## Pourquoi le double Prisma PROJETTE
 *
 * C'est la condition sans laquelle la moitié la plus chère de la descente reste
 * invisible. Un double qui rend ce qu'on lui dit, quel que soit le `select`,
 * sert les quatre rangs à un appelant qui n'en charge qu'un : le témoin passe
 * au vert sur une descente MORTE en production. `projeter` applique donc le
 * `select` reçu à une ligne complète, exactement comme la base — et une requête
 * SANS `select` rend tous les scalaires, comme Prisma.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockResolveConversationId = jest.fn<any>();
const noop = jest.fn<any>((reply: any) => reply);

jest.mock('../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../utils/response', () => ({
  sendSuccess: jest.fn<any>((reply: any) => reply),
  sendBadRequest: jest.fn<any>((reply: any) => reply),
  sendUnauthorized: jest.fn<any>((reply: any) => reply),
  sendForbidden: jest.fn<any>((reply: any) => reply),
  sendNotFound: jest.fn<any>((reply: any) => reply),
  sendConflict: jest.fn<any>((reply: any) => reply),
  sendInternalError: jest.fn<any>((reply: any) => reply),
  sendError: jest.fn<any>((reply: any) => reply),
}));

jest.mock('../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>(),
    }),
  },
}));

jest.mock('../utils/participant-lookup-cache', () => ({
  invalidateParticipantLookup: jest.fn<any>(),
}));

jest.mock('../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: jest.fn<any>().mockReturnValue({
    filterPresenceForViewer: jest.fn<any>((_viewer: any, rows: any) => rows),
  }),
}));

/**
 * Surcharge CIBLÉE, jamais un double partiel : `sharing.ts` importe DEUX noms
 * de ce module, et un remplacement complet perdrait `resolveClientIp` — le
 * patron que le `CLAUDE.md` de ce service nomme trois fois (cycles 86, 91, 93).
 * Ce que le témoin veut lire est le `profile` REMIS à la loi d'admission, pas
 * ce qu'elle en fait : `not-found` est le verdict terminal le moins coûteux.
 */
const mockPerformLinkJoin = jest.fn<any>(async () => ({ kind: 'not-found' }));

jest.mock('../routes/conversations/link-admission', () => ({
  ...(jest.requireActual('../routes/conversations/link-admission') as object),
  performLinkJoin: (...args: any[]) => mockPerformLinkJoin(...args),
}));

import { registerSharingRoutes } from '../routes/conversations/sharing';
import { registerParticipantsRoutes } from '../routes/conversations/participants';
import { recipientLanguage } from '../utils/recipient-language';

// ─── La ligne `User` et sa projection ────────────────────────────────────────

/** Les quatre rangs du Prisme, tels que la base les porte. */
type PrismeDuCompte = {
  readonly systemLanguage: string | null;
  readonly regionalLanguage: string | null;
  readonly customDestinationLanguage: string | null;
  readonly deviceLocale: string | null;
};

const CONV_ID = '507f1f77bcf86cd799439011';
const ACTOR_ID = '507f1f77bcf86cd799439022';
const TARGET_ID = '507f1f77bcf86cd799439033';
const ACTOR_ROW_ID = '507f1f77bcf86cd799439077';

const compte = (prisme: Partial<PrismeDuCompte>): Record<string, unknown> => ({
  id: TARGET_ID,
  username: 'target',
  displayName: 'Target',
  firstName: 'T',
  lastName: 'Arget',
  avatar: null,
  email: 'target@example.com',
  systemLanguage: null,
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: null,
  ...prisme,
});

/**
 * Ce que la base rend : les colonnes DEMANDÉES, et elles seules — ou TOUS les
 * scalaires quand aucun `select` n'est posé, exactement comme Prisma.
 */
const projeter = (
  ligne: Record<string, unknown>,
  select: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> =>
  select === undefined
    ? ligne
    : Object.fromEntries(
        Object.entries(select)
          .filter(([, demande]) => demande === true)
          .map(([colonne]) => [colonne, ligne[colonne]]),
      );

const PROJECTION_RANG_1_NU = { systemLanguage: true } as const;
const PROJECTION_DU_PRISME = {
  systemLanguage: true,
  regionalLanguage: true,
  customDestinationLanguage: true,
  deviceLocale: true,
} as const;

// ─── Le harnais de routes ────────────────────────────────────────────────────

const actorRow = {
  id: ACTOR_ROW_ID, userId: ACTOR_ID, conversationId: CONV_ID, role: 'admin',
  isActive: true, bannedAt: null, joinedAt: new Date('2026-01-01'),
  permissions: { canSendMessages: true, canSendFiles: true, canSendImages: true, canViewHistory: true },
};

const lignesFiltrees = (rows: any[], where: any) =>
  rows.filter((row) => {
    if (where?.userId !== undefined && where.userId !== row.userId) return false;
    if (where?.conversationId !== undefined && where.conversationId !== row.conversationId) return false;
    if (where?.isActive !== undefined && where.isActive !== row.isActive) return false;
    if (where?.role?.in !== undefined && !where.role.in.includes(row.role)) return false;
    return true;
  });

function passerelleServant(ligne: Record<string, unknown>) {
  const surLeCompte = jest.fn<any>(async (args: any) => projeter(ligne, args?.select));
  return {
    conversation: {
      findUnique: jest.fn<any>(async (args: any) => ({
        id: CONV_ID, type: 'group', title: 'Test', isActive: true, closedAt: null,
        createdAt: new Date('2025-01-01'),
        participants: lignesFiltrees([actorRow], args?.include?.participants?.where).map((row) => ({
          id: row.id, userId: row.userId, role: row.role,
          user: { id: row.userId, username: 'u', role: 'USER' },
        })),
      })),
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID }),
    },
    participant: {
      findFirst: jest.fn<any>(async (args: any) => lignesFiltrees([actorRow], args?.where)[0] ?? null),
      findUnique: jest.fn<any>(async (args: any) => (args?.where?.id === ACTOR_ROW_ID ? actorRow : null)),
      findMany: jest.fn<any>(async (args: any) => lignesFiltrees([actorRow], args?.where)),
      create: jest.fn<any>(async (args: any) => ({ id: 'created-row', ...args?.data, user: ligne })),
      update: jest.fn<any>(async (args: any) => ({ id: args?.where?.id, ...args?.data, user: ligne })),
      count: jest.fn<any>().mockResolvedValue(2),
    },
    user: { findUnique: surLeCompte, findFirst: surLeCompte },
    message: { create: jest.fn<any>(async (args: any) => ({ id: 'sys-row', ...args?.data })) },
    __surLeCompte: surLeCompte,
  } as any;
}

function fastifyDeTest(prisma: any) {
  const routes: { method: string; path: string; handler: any }[] = [];
  const enregistrer = (method: string) =>
    jest.fn<any>((path: string, options: any, handler: any) => {
      routes.push({ method, path, handler: handler ?? options.handler ?? options });
    });
  return {
    routes,
    prisma,
    notificationService: {
      createMemberJoinedNotification: jest.fn<any>().mockResolvedValue(undefined),
      createMemberJoinedNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
      createConversationInviteNotification: jest.fn<any>().mockResolvedValue(undefined),
      createAddedToConversationNotification: jest.fn<any>().mockResolvedValue(undefined),
    },
    mentionService: { invalidateCacheForConversation: jest.fn<any>().mockResolvedValue(undefined) },
    socketIOHandler: {
      getManager: jest.fn<any>().mockReturnValue({
        getIO: jest.fn<any>().mockReturnValue({ to: jest.fn<any>().mockReturnValue({ emit: jest.fn<any>() }) }),
        joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined),
        broadcastMessage: jest.fn<any>().mockResolvedValue(undefined),
      }),
    },
    get: enregistrer('GET'), post: enregistrer('POST'),
    patch: enregistrer('PATCH'), delete: enregistrer('DELETE'),
  } as any;
}

const reponseDeTest = () => {
  const reply: any = { status: jest.fn<any>(), send: jest.fn<any>((b: any) => { reply._body = b; return reply; }) };
  reply.status.mockReturnValue(reply);
  return reply;
};

const routePour = (fastify: any, method: string, fragment: string) => {
  const trouvee = fastify.routes.find((r: any) => r.method === method && r.path.includes(fragment));
  if (!trouvee) throw new Error(`Route ${method} *${fragment}* introuvable`);
  return trouvee;
};

const contexteActeur = {
  type: 'user', userId: ACTOR_ID, isAuthenticated: true, isAnonymous: false,
  registeredUser: { id: ACTOR_ID, role: 'USER' },
};

/** La langue écrite dans `Participant.language` par `POST …/participants`. */
async function langueEcriteParLAjout(ligne: Record<string, unknown>): Promise<string> {
  const prisma = passerelleServant(ligne);
  const fastify = fastifyDeTest(prisma);
  registerParticipantsRoutes(fastify, prisma, noop, noop);

  await routePour(fastify, 'POST', ':id/participants').handler(
    { params: { id: CONV_ID }, body: { userId: TARGET_ID }, headers: {}, ip: '127.0.0.1',
      authContext: contexteActeur, user: { userId: ACTOR_ID } },
    reponseDeTest(),
  );

  expect(prisma.participant.create).toHaveBeenCalled();
  return prisma.participant.create.mock.calls[0][0].data.language;
}

/** Le `profile.language` que `POST /conversations/join/:linkId` remet à la loi d'admission. */
async function langueRemiseParLeLien(ligne: Record<string, unknown>): Promise<{
  readonly langue: string;
  readonly select: Readonly<Record<string, unknown>> | undefined;
}> {
  const prisma = passerelleServant(ligne);
  const fastify = fastifyDeTest(prisma);
  registerSharingRoutes(fastify, prisma, noop, noop);

  await routePour(fastify, 'POST', 'join/:linkId').handler(
    { params: { linkId: 'mshy_Lien1' }, headers: {}, ip: '127.0.0.1',
      authContext: { ...contexteActeur, userId: TARGET_ID }, user: { userId: TARGET_ID } },
    reponseDeTest(),
  );

  expect(mockPerformLinkJoin).toHaveBeenCalled();
  return {
    langue: (mockPerformLinkJoin.mock.calls[0][0] as any).profile.language,
    select: prisma.__surLeCompte.mock.calls[0]?.[0]?.select,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveConversationId.mockResolvedValue(CONV_ID);
  mockPerformLinkJoin.mockResolvedValue({ kind: 'not-found' });
});

// ─── Le rang 1 : là où aucun témoin ne peut tomber ───────────────────────────

describe('#4662 — le rang 1 est INDISCERNABLE, et c’est mesuré', () => {
  it('rend le même verdict sous la règle simple et sous la descente', () => {
    const rang1 = compte({ systemLanguage: 'de' });

    expect(rang1.systemLanguage ?? 'en').toBe('de');
    expect(recipientLanguage(rang1, 'en')).toBe('de');
  });

  it('et ils DIVERGENT au rang 2 comme au rang 4 — les seuls rangs qui mesurent', () => {
    const rang2 = compte({ regionalLanguage: 'de' });
    const rang4 = compte({ deviceLocale: 'es-ES' });

    expect(rang2.systemLanguage ?? 'en').toBe('en');
    expect(recipientLanguage(rang2, 'en')).toBe('de');

    expect(rang4.systemLanguage ?? 'en').toBe('en');
    expect(recipientLanguage(rang4, 'en')).toBe('es');
  });

  it('et une projection ÉTROITE efface les deux rangs, quel que soit l’appel', () => {
    const rang2 = compte({ regionalLanguage: 'de' });

    expect(recipientLanguage(projeter(rang2, PROJECTION_RANG_1_NU), 'en')).toBe('en');
    expect(recipientLanguage(projeter(rang2, PROJECTION_DU_PRISME), 'en')).toBe('de');
  });
});

// ─── Site 1 : POST /conversations/:id/participants ───────────────────────────

describe('#4662 — `POST …/participants` écrit la langue du RANG où elle vit', () => {
  it('écrit `de` pour un compte dont la langue vit dans `regionalLanguage` SEUL (rang 2)', async () => {
    await expect(langueEcriteParLAjout(compte({ regionalLanguage: 'de' }))).resolves.toBe('de');
  });

  it('écrit `es` pour un compte dont seule la LOCALE APPAREIL est connue (rang 4)', async () => {
    await expect(langueEcriteParLAjout(compte({ deviceLocale: 'es-ES' }))).resolves.toBe('es');
  });

  it('laisse la langue applicative gagner sur la locale appareil', async () => {
    await expect(
      langueEcriteParLAjout(compte({ regionalLanguage: 'de', deviceLocale: 'en-US' })),
    ).resolves.toBe('de');
  });

  it('retombe sur le repli du SITE quand le compte n’a AUCUNE préférence', async () => {
    await expect(langueEcriteParLAjout(compte({}))).resolves.toBe('en');
  });

  it('normalise ce qu’il écrit — la colonne est lue en minuscules par ses lecteurs', async () => {
    await expect(langueEcriteParLAjout(compte({ systemLanguage: 'PT-BR' }))).resolves.toBe('pt');
  });
});

// ─── Site 2 : POST /conversations/join/:linkId ───────────────────────────────

describe('#4662 — `POST /conversations/join/:linkId` juge sur la langue du RANG où elle vit', () => {
  it('remet `de` pour un compte dont la langue vit dans `regionalLanguage` SEUL (rang 2)', async () => {
    await expect(langueRemiseParLeLien(compte({ regionalLanguage: 'de' }))).resolves.toMatchObject({
      langue: 'de',
    });
  });

  it('remet `es` pour un compte dont seule la LOCALE APPAREIL est connue (rang 4)', async () => {
    await expect(langueRemiseParLeLien(compte({ deviceLocale: 'es-ES' }))).resolves.toMatchObject({
      langue: 'es',
    });
  });

  it('DEMANDE les quatre colonnes du Prisme à la base', async () => {
    // La moitié de la descente qu'aucun témoin de RANG ne verrait si le double
    // ne projetait pas : l'appel adopté sur une projection gardée est
    // indiscernable d'un site juste (§ leçon 276).
    const { select } = await langueRemiseParLeLien(compte({ regionalLanguage: 'de' }));

    expect(select).toMatchObject(PROJECTION_DU_PRISME);
  });
});

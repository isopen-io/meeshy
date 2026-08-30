/**
 * prisma-queries unit tests
 *
 * Tests routing logic (ObjectId vs. slug/linkId) and Prisma call shapes
 * for the four query helpers in routes/links/utils/prisma-queries.ts.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Mock attachmentIncludes so the module resolves without the full Prisma
// validator environment.
// ---------------------------------------------------------------------------
jest.mock('../../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: { id: true, url: true, mimeType: true },
}));

import {
  findShareLinkByIdentifier,
  getConversationMessages,
  getConversationMessagesWithDetails,
  countConversationMessages,
  shareLinkSelectStructure,
  findActiveUserParticipant,
  findLinkMembers,
  findLinkAnonymousParticipants,
  countLinkParticipantsByType,
  countOnlineAnonymousParticipants,
} from '../../../../routes/links/utils/prisma-queries';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 24-char hex string — valid MongoDB ObjectId shape */
const OBJECT_ID = '507f1f77bcf86cd799439011';
/** Short custom slug — NOT a valid ObjectId */
const CUSTOM_SLUG = 'mshy_meeshy-public';
/** linkId style — NOT a valid ObjectId (has a dot) */
const LINK_ID = `mshy_${OBJECT_ID}.1748000000`;

function makeMockPrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  return {
    conversationShareLink: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    // #4165 — les cinq requêtes ciblées qui remplacent l'ancienne relation
    // `participants` chargée en bloc SANS `take` sur `shareLinkSelectStructure`.
    participant: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

// ---------------------------------------------------------------------------
// findShareLinkByIdentifier
// ---------------------------------------------------------------------------

describe('findShareLinkByIdentifier — ObjectId routing', () => {
  it('calls findUnique with id when identifier is a 24-char hex string', async () => {
    const prisma = makeMockPrisma();
    const findUnique = prisma.conversationShareLink.findUnique as jest.Mock;
    findUnique.mockResolvedValue({ id: OBJECT_ID });

    await findShareLinkByIdentifier(prisma, OBJECT_ID);

    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: OBJECT_ID },
      select: shareLinkSelectStructure,
    });
  });

  it('does NOT call findFirst when identifier is a valid ObjectId', async () => {
    const prisma = makeMockPrisma();
    const findFirst = prisma.conversationShareLink.findFirst as jest.Mock;
    (prisma.conversationShareLink.findUnique as jest.Mock).mockResolvedValue(null);

    await findShareLinkByIdentifier(prisma, OBJECT_ID);

    expect(findFirst).not.toHaveBeenCalled();
  });

  it('returns the value from findUnique', async () => {
    const prisma = makeMockPrisma();
    const expected = { id: OBJECT_ID, linkId: 'whatever' };
    (prisma.conversationShareLink.findUnique as jest.Mock).mockResolvedValue(expected);

    const result = await findShareLinkByIdentifier(prisma, OBJECT_ID);

    expect(result).toBe(expected);
  });

  it('returns null when findUnique finds nothing', async () => {
    const prisma = makeMockPrisma();
    (prisma.conversationShareLink.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await findShareLinkByIdentifier(prisma, OBJECT_ID);

    expect(result).toBeNull();
  });
});

describe('findShareLinkByIdentifier — slug/linkId routing', () => {
  it('calls findFirst with OR clause when identifier is a custom slug', async () => {
    const prisma = makeMockPrisma();
    const findFirst = prisma.conversationShareLink.findFirst as jest.Mock;
    findFirst.mockResolvedValue({ identifier: CUSTOM_SLUG });

    await findShareLinkByIdentifier(prisma, CUSTOM_SLUG);

    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith({
      where: { OR: [{ linkId: CUSTOM_SLUG }, { identifier: CUSTOM_SLUG }] },
      select: shareLinkSelectStructure,
    });
  });

  it('calls findFirst with OR clause when identifier is a mshy_*.ts linkId', async () => {
    const prisma = makeMockPrisma();
    const findFirst = prisma.conversationShareLink.findFirst as jest.Mock;
    findFirst.mockResolvedValue(null);

    await findShareLinkByIdentifier(prisma, LINK_ID);

    expect(findFirst).toHaveBeenCalledWith({
      where: { OR: [{ linkId: LINK_ID }, { identifier: LINK_ID }] },
      select: shareLinkSelectStructure,
    });
  });

  it('does NOT call findUnique when identifier is a slug', async () => {
    const prisma = makeMockPrisma();
    const findUnique = prisma.conversationShareLink.findUnique as jest.Mock;
    (prisma.conversationShareLink.findFirst as jest.Mock).mockResolvedValue(null);

    await findShareLinkByIdentifier(prisma, CUSTOM_SLUG);

    expect(findUnique).not.toHaveBeenCalled();
  });

  it('returns the value from findFirst', async () => {
    const prisma = makeMockPrisma();
    const expected = { id: OBJECT_ID, identifier: CUSTOM_SLUG };
    (prisma.conversationShareLink.findFirst as jest.Mock).mockResolvedValue(expected);

    const result = await findShareLinkByIdentifier(prisma, CUSTOM_SLUG);

    expect(result).toBe(expected);
  });

  it('returns null when findFirst finds nothing', async () => {
    const prisma = makeMockPrisma();
    (prisma.conversationShareLink.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await findShareLinkByIdentifier(prisma, CUSTOM_SLUG);

    expect(result).toBeNull();
  });
});

describe('findShareLinkByIdentifier — ObjectId boundary cases', () => {
  it('treats a 23-char hex string as a slug (not ObjectId)', async () => {
    const prisma = makeMockPrisma();
    const findFirst = prisma.conversationShareLink.findFirst as jest.Mock;
    findFirst.mockResolvedValue(null);

    const twentyThreeHex = 'a'.repeat(23);
    await findShareLinkByIdentifier(prisma, twentyThreeHex);

    expect(findFirst).toHaveBeenCalled();
    expect(prisma.conversationShareLink.findUnique as jest.Mock).not.toHaveBeenCalled();
  });

  it('treats a 25-char hex string as a slug (not ObjectId)', async () => {
    const prisma = makeMockPrisma();
    const findFirst = prisma.conversationShareLink.findFirst as jest.Mock;
    findFirst.mockResolvedValue(null);

    const twentyFiveHex = 'a'.repeat(25);
    await findShareLinkByIdentifier(prisma, twentyFiveHex);

    expect(findFirst).toHaveBeenCalled();
    expect(prisma.conversationShareLink.findUnique as jest.Mock).not.toHaveBeenCalled();
  });

  it('treats a 24-char string containing non-hex chars as a slug', async () => {
    const prisma = makeMockPrisma();
    const findFirst = prisma.conversationShareLink.findFirst as jest.Mock;
    findFirst.mockResolvedValue(null);

    // Contains 'g' which is not a hex char
    const notHex = 'g07f1f77bcf86cd799439011';
    await findShareLinkByIdentifier(prisma, notHex);

    expect(findFirst).toHaveBeenCalled();
    expect(prisma.conversationShareLink.findUnique as jest.Mock).not.toHaveBeenCalled();
  });

  it('accepts uppercase hex as a valid ObjectId', async () => {
    const prisma = makeMockPrisma();
    const findUnique = prisma.conversationShareLink.findUnique as jest.Mock;
    findUnique.mockResolvedValue(null);

    const upperHex = OBJECT_ID.toUpperCase();
    await findShareLinkByIdentifier(prisma, upperHex);

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: upperHex },
      select: shareLinkSelectStructure,
    });
  });
});

// ---------------------------------------------------------------------------
// getConversationMessages
// ---------------------------------------------------------------------------

describe('getConversationMessages', () => {
  it('calls prisma.message.findMany with correct shape', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessages(prisma, OBJECT_ID, 20, 0);

    expect(findMany).toHaveBeenCalledTimes(1);
    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(call).toMatchObject({
      where: { conversationId: OBJECT_ID, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
      skip: 0,
    });
  });

  // `statusEntries` était chargé ici SANS aucun lecteur : le formateur de ce
  // chemin (`formatMessageWithUnifiedSender`) ne les recopie même pas. Une
  // relation payée à chaque page de lien partagé, jetée avant la sérialisation.
  it('includes sender — but not the statusEntries nobody reads', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessages(prisma, OBJECT_ID, 10, 5);

    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    const include = call.include as Record<string, unknown>;
    expect(include).toHaveProperty('sender');
    expect(include).not.toHaveProperty('statusEntries');
  });

  it('does NOT include attachments, replyTo, or reactions', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessages(prisma, OBJECT_ID, 10, 0);

    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    const include = call.include as Record<string, unknown>;
    expect(include).not.toHaveProperty('attachments');
    expect(include).not.toHaveProperty('replyTo');
    expect(include).not.toHaveProperty('reactions');
  });

  it('forwards limit and offset correctly', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessages(prisma, OBJECT_ID, 50, 100);

    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(call.take).toBe(50);
    expect(call.skip).toBe(100);
  });

  it('returns the array from findMany', async () => {
    const prisma = makeMockPrisma();
    const messages = [{ id: 'msg1' }, { id: 'msg2' }];
    (prisma.message.findMany as jest.Mock).mockResolvedValue(messages);

    const result = await getConversationMessages(prisma, OBJECT_ID, 10, 0);

    expect(result).toBe(messages);
  });

  it('filters out deleted messages (deletedAt: null in where clause)', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessages(prisma, OBJECT_ID, 10, 0);

    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    const where = call.where as Record<string, unknown>;
    expect(where.deletedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getConversationMessagesWithDetails
// ---------------------------------------------------------------------------

describe('getConversationMessagesWithDetails', () => {
  it('calls prisma.message.findMany with correct base shape', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessagesWithDetails(prisma, OBJECT_ID, 20, 0);

    expect(findMany).toHaveBeenCalledTimes(1);
    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(call).toMatchObject({
      where: { conversationId: OBJECT_ID, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
      skip: 0,
    });
  });

  // Ici le formateur les recopiait bien (`formatLinkMessageWithDetails`),
  // mais `messageSchema` (routes/links/types.ts) ne les déclare pas :
  // `fast-json-stringify` retirait le tableau juste après. Chargé, recopié,
  // jeté — sur CHAQUE page de messages d'un lien partagé, sans opt-in.
  it('includes sender, attachments, replyTo and reactions — but not statusEntries', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessagesWithDetails(prisma, OBJECT_ID, 10, 0);

    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    const include = call.include as Record<string, unknown>;
    expect(include).toHaveProperty('sender');
    expect(include).toHaveProperty('attachments');
    expect(include).toHaveProperty('replyTo');
    expect(include).toHaveProperty('reactions');
    expect(include).not.toHaveProperty('statusEntries');
  });

  // Le message CITÉ ne rend que son texte et son auteur : `formatReplyToMessage`
  // n'a jamais recopié ses pièces jointes ni ses réactions. Les charger était
  // une jointure imbriquée par page pour des données qui n'atteignaient même
  // pas le sérialiseur.
  it('replyTo ne charge que son sender — ni pièces jointes ni réactions', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessagesWithDetails(prisma, OBJECT_ID, 10, 0);

    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    const include = call.include as Record<string, unknown>;
    const replyTo = include.replyTo as Record<string, unknown>;
    expect(replyTo).toHaveProperty('include');
    const replyToInclude = replyTo.include as Record<string, unknown>;
    expect(replyToInclude).toHaveProperty('sender');
    expect(replyToInclude).not.toHaveProperty('attachments');
    expect(replyToInclude).not.toHaveProperty('reactions');
  });

  it('forwards limit and offset correctly', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessagesWithDetails(prisma, OBJECT_ID, 30, 60);

    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(call.take).toBe(30);
    expect(call.skip).toBe(60);
  });

  it('returns the array from findMany', async () => {
    const prisma = makeMockPrisma();
    const messages = [{ id: 'msg_detail_1' }];
    (prisma.message.findMany as jest.Mock).mockResolvedValue(messages);

    const result = await getConversationMessagesWithDetails(prisma, OBJECT_ID, 10, 0);

    expect(result).toBe(messages);
  });

  it('also filters out deleted messages (deletedAt: null)', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessagesWithDetails(prisma, OBJECT_ID, 10, 0);

    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    const where = call.where as Record<string, unknown>;
    expect(where.deletedAt).toBeNull();
  });

  it('includes more fields than the basic getConversationMessages', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.message.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await getConversationMessagesWithDetails(prisma, OBJECT_ID, 10, 0);

    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    const include = call.include as Record<string, unknown>;
    // These fields are ONLY in the "WithDetails" variant
    expect(Object.keys(include).length).toBeGreaterThan(2);
    expect(include).toHaveProperty('attachments');
    expect(include).toHaveProperty('replyTo');
    expect(include).toHaveProperty('reactions');
  });
});

// ---------------------------------------------------------------------------
// countConversationMessages
// ---------------------------------------------------------------------------

describe('countConversationMessages', () => {
  it('calls prisma.message.count with conversationId and deletedAt: null', async () => {
    const prisma = makeMockPrisma();
    const count = prisma.message.count as jest.Mock;
    count.mockResolvedValue(42);

    await countConversationMessages(prisma, OBJECT_ID);

    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith({
      where: { conversationId: OBJECT_ID, deletedAt: null },
    });
  });

  it('returns the numeric count from Prisma', async () => {
    const prisma = makeMockPrisma();
    (prisma.message.count as jest.Mock).mockResolvedValue(99);

    const result = await countConversationMessages(prisma, OBJECT_ID);

    expect(result).toBe(99);
  });

  it('returns 0 when there are no messages', async () => {
    const prisma = makeMockPrisma();
    (prisma.message.count as jest.Mock).mockResolvedValue(0);

    const result = await countConversationMessages(prisma, OBJECT_ID);

    expect(result).toBe(0);
  });

  it('excludes deleted messages from the count (where deletedAt: null)', async () => {
    const prisma = makeMockPrisma();
    const count = prisma.message.count as jest.Mock;
    count.mockResolvedValue(5);

    await countConversationMessages(prisma, OBJECT_ID);

    const call = count.mock.calls[0][0] as Record<string, unknown>;
    const where = call.where as Record<string, unknown>;
    expect(where.deletedAt).toBeNull();
    expect(where.conversationId).toBe(OBJECT_ID);
  });
});

// ---------------------------------------------------------------------------
// shareLinkSelectStructure
// ---------------------------------------------------------------------------

// #4165 — cette section a été RÉÉCRITE, pas assouplie : la relation
// `participants` chargée en bloc SANS `take` sur `shareLinkSelectStructure`
// (au plus 5 000 lignes sur "meeshy", le salon public, à CHAQUE appel de
// `GET /links/:identifier`) est le pire cas nommé par #4165. Chaque garantie
// que l'ancien `select` monolithique portait a un TÉMOIN ci-dessous, sur son
// NOUVEAU site — aucune n'a été retirée, chacune a changé d'adresse :
//
//   ancien select (`participants.select.X`)         → nouveau site
//   isActive / userId (reconnaître LE lecteur)       → findActiveUserParticipant
//   lastActiveAt (F2, servi à ADMIN)                 → findLinkAnonymousParticipants
//   HISTORY_FLOOR_PARTICIPANT_SELECT (role, etc.)    → loadReaderHistoryFloor
//                                                       (services/historyFloor.ts,
//                                                       NON modifié par #4165 —
//                                                       retrieval.ts l'appelle
//                                                       directement, couvert
//                                                       par `links-retrieval.test.ts`
//                                                       § « plancher d'historique »)
//   anonymousSession.profile (identité affichée)     → findLinkAnonymousParticipants
//   user.role (bypass plateforme ADMIN/BIGBOSS)      → loadReaderHistoryFloor,
//                                                       select INCHANGÉ (SSOT),
//                                                       jamais recopié ici
describe('shareLinkSelectStructure — la relation participants EN BLOC a disparu', () => {
  // La preuve POSITIVE du correctif #4165 : plus aucune relation à profondeur
  // non bornée sur la conversation d'un lien. Une régression qui la
  // réintroduirait (avec ou sans `take`) doit faire tomber CE témoin.
  it("ne charge plus `participants` du tout — la SOURCE du findMany sans take a été retirée, pas seulement bornée", () => {
    const conversationSelect = shareLinkSelectStructure.conversation.select as Record<string, any>;

    expect(conversationSelect.participants).toBeUndefined();
  });
});

describe('findActiveUserParticipant — reconnaît LE lecteur (remplace isActive/userId sur la relation en bloc)', () => {
  // `retrieval.ts` décidait `userType: 'member'` avec
  // `member.userId === user.id && member.isActive` sur un tableau chargé en
  // bloc. Cette requête CIBLÉE porte exactement les deux mêmes conditions,
  // dans son `where` plutôt que dans un `select` à parcourir — indépendante
  // de l'effectif de la conversation : la conversation partagée ne s'ouvrait
  // en aperçu pour ses PROPRES membres que si l'un des deux se perdait.
  it('filtre par conversationId, userId, type user ET isActive — les quatre conditions de reconnaissance', async () => {
    const prisma = makeMockPrisma();
    const findFirst = prisma.participant.findFirst as jest.Mock;
    findFirst.mockResolvedValue({ id: 'part-1' });

    await findActiveUserParticipant(prisma, OBJECT_ID, 'user-42');

    expect(findFirst).toHaveBeenCalledWith({
      where: { conversationId: OBJECT_ID, userId: 'user-42', type: 'user', isActive: true },
      select: { id: true },
    });
  });

  it('rend null quand aucune ligne active ne matche — le lecteur reste "anonymous", jamais "member" par défaut', async () => {
    const prisma = makeMockPrisma();
    (prisma.participant.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await findActiveUserParticipant(prisma, OBJECT_ID, 'user-42');

    expect(result).toBeNull();
  });
});

describe('findLinkMembers — page bornée, sans présence (les membres ne montrent jamais isOnline/lastActiveAt)', () => {
  it('filtre type user + isActive, et borne au plafond demandé', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.participant.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await findLinkMembers(prisma, OBJECT_ID, 50);

    expect(findMany).toHaveBeenCalledWith({
      where: { conversationId: OBJECT_ID, type: 'user', isActive: true },
      orderBy: { joinedAt: 'asc' },
      take: 50,
      select: expect.objectContaining({ id: true, role: true, joinedAt: true }),
    });
  });

  // `retrieval.ts` sert TOUJOURS `isOnline: false, lastActiveAt: null` pour un
  // membre — lien consultable sans authentification, présence jamais
  // divulguée. Ne pas les CHARGER ici n'est pas un oubli : c'est payer une
  // colonne que le handler écraserait de toute façon.
  it("ne sélectionne NI isOnline NI lastActiveAt sur l'utilisateur — jamais servis pour un membre", async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.participant.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await findLinkMembers(prisma, OBJECT_ID);

    const call = findMany.mock.calls[0][0] as Record<string, any>;
    const userSelect = call.select.user.select as Record<string, unknown>;
    expect(userSelect).not.toHaveProperty('isOnline');
    expect(userSelect).not.toHaveProperty('lastActiveAt');
  });

  it('utilise le plafond par défaut quand aucun `take` explicite n’est fourni', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.participant.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await findLinkMembers(prisma, OBJECT_ID);

    const call = findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(call.take).toBeGreaterThan(0);
  });
});

describe('findLinkAnonymousParticipants — page bornée, AVEC présence gatée par le viewer', () => {
  it('filtre type anonymous + isActive, et borne au plafond demandé', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.participant.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await findLinkAnonymousParticipants(prisma, OBJECT_ID, 50);

    expect(findMany).toHaveBeenCalledWith({
      where: { conversationId: OBJECT_ID, type: 'anonymous', isActive: true },
      orderBy: { joinedAt: 'asc' },
      take: 50,
      select: expect.objectContaining({
        id: true,
        displayName: true,
        avatar: true,
        language: true,
        isOnline: true,
        lastActiveAt: true,
        joinedAt: true,
        permissions: true,
      }),
    });
  });

  // F2 (2026-08-26) : `retrieval.ts` sert `lastActiveAt` à un viewer
  // ADMIN/BIGBOSS pour les participants anonymes. Sans ce champ dans le
  // `select`, le site n'a RIEN de vrai à servir et fabriquait `joinedAt` à la
  // place — une date d'arrivée n'est pas une dernière activité.
  it('sélectionne isOnline ET lastActiveAt — le seul des deux appelants où la présence EST servie (gatée par le viewer)', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.participant.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await findLinkAnonymousParticipants(prisma, OBJECT_ID);

    const call = findMany.mock.calls[0][0] as Record<string, any>;
    expect(call.select.isOnline).toBe(true);
    expect(call.select.lastActiveAt).toBe(true);
  });

  // L'identité d'un anonyme vit dans `anonymousSession.profile` — `firstName`,
  // `lastName`, `username`. `rights` (nécessaire au plancher d'historique)
  // n'a plus besoin d'être chargé ICI : `loadReaderHistoryFloor` le lit dans
  // SA propre requête (`services/historyFloor.ts`), jamais modifiée par #4165.
  it('sélectionne anonymousSession.profile — pas `rights`, désormais lu ailleurs', async () => {
    const prisma = makeMockPrisma();
    const findMany = prisma.participant.findMany as jest.Mock;
    findMany.mockResolvedValue([]);

    await findLinkAnonymousParticipants(prisma, OBJECT_ID);

    const call = findMany.mock.calls[0][0] as Record<string, any>;
    expect(call.select.anonymousSession).toEqual({ select: { profile: true } });
  });
});

describe('countLinkParticipantsByType / countOnlineAnonymousParticipants — les VRAIS totaux, indépendants du plafond d’affichage', () => {
  it('compte séparément les membres et les participants anonymes actifs', async () => {
    const prisma = makeMockPrisma();
    const count = prisma.participant.count as jest.Mock;
    count.mockResolvedValueOnce(12).mockResolvedValueOnce(340);

    const result = await countLinkParticipantsByType(prisma, OBJECT_ID);

    expect(count).toHaveBeenNthCalledWith(1, { where: { conversationId: OBJECT_ID, type: 'user', isActive: true } });
    expect(count).toHaveBeenNthCalledWith(2, { where: { conversationId: OBJECT_ID, type: 'anonymous', isActive: true } });
    expect(result).toEqual({ totalMembers: 12, totalAnonymousParticipants: 340 });
  });

  it('compte les anonymes EN LIGNE — même prédicat isOnline que la liste gatée', async () => {
    const prisma = makeMockPrisma();
    const count = prisma.participant.count as jest.Mock;
    count.mockResolvedValue(7);

    await countOnlineAnonymousParticipants(prisma, OBJECT_ID);

    expect(count).toHaveBeenCalledWith({
      where: { conversationId: OBJECT_ID, type: 'anonymous', isActive: true, isOnline: true },
    });
  });
});

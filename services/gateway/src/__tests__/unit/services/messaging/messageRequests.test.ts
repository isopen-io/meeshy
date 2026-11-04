/**
 * LA BOÎTE DE DEMANDES (#14107, MSG-01/02, MIN-03, RG-21) — témoins du site
 * unique `services/messaging/messageRequests.ts`, joués sur un monde en mémoire
 * qui ÉVALUE les clauses.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { FOUNDING_MEMBER_PERMISSIONS } from '../../../../services/participantRights';
import {
  MESSAGE_REQUEST_FILTER_THRESHOLD,
  acceptMessageRequest,
  answerMessageRequest,
  decideDirectOpening,
  messageRequestRiskScore,
  requesterPermissionsFor,
  requestRecipientFields,
  servedMessageRequest,
  decideOpenings,
} from '../../../../services/messaging/messageRequests';
import { noteMessageInteractions } from '../../../../services/relations/messageInteractions';
import { cacheParticipant, getCachedParticipant } from '../../../../utils/participant-lookup-cache';
import { ADULT_BIRTH, MINOR_BIRTH, messagingWorld, type CircleLink, type Row } from '../../../helpers/messaging-circle-world';

const NOW = new Date('2026-11-02T12:00:00.000Z');
const HOURS = 3_600_000;

const ALICE = '6200000000000000000000a1';
const BOB = '6200000000000000000000a2';
const MINEUR = '6200000000000000000000a3';
const CO_MEMBRE_MINEUR = '6200000000000000000000a4';
const CONNAISSANCE = '6200000000000000000000a5';
const NOUVEAU = '6200000000000000000000a6';
const COMMUNAUTE = '6200000000000000000000c1';
const DM = '6200000000000000000000d1';
const P_ALICE = '6200000000000000000000e1';
const P_BOB = '6200000000000000000000e2';

const monde = (extra: { links?: readonly CircleLink[]; participants?: readonly Row[]; users?: readonly Row[] } = {}) =>
  messagingWorld({
    links: [[ALICE, CONNAISSANCE, 'ACQUAINTANCE'], ...(extra.links ?? [])],
    users: [
      { id: ALICE, birthDate: ADULT_BIRTH, createdAt: new Date('2025-01-01T00:00:00.000Z') },
      { id: BOB, birthDate: ADULT_BIRTH, createdAt: new Date('2025-01-01T00:00:00.000Z') },
      { id: MINEUR, birthDate: MINOR_BIRTH, createdAt: new Date('2025-01-01T00:00:00.000Z') },
      { id: CO_MEMBRE_MINEUR, birthDate: MINOR_BIRTH, createdAt: new Date('2025-01-01T00:00:00.000Z') },
      { id: CONNAISSANCE, birthDate: ADULT_BIRTH, createdAt: new Date('2025-01-01T00:00:00.000Z') },
      { id: NOUVEAU, birthDate: null, createdAt: new Date(NOW.getTime() - 2 * HOURS) },
      ...(extra.users ?? []),
    ],
    communityMembers: [
      { userId: ALICE, communityId: COMMUNAUTE, isActive: true },
      { userId: CO_MEMBRE_MINEUR, communityId: COMMUNAUTE, isActive: true },
    ],
    conversations: [{ id: DM, type: 'direct' }],
    participants: extra.participants ?? [],
  });

const db = (world: ReturnType<typeof monde>) => world.prisma as unknown as PrismaClient;

const demandeEnAttente = (overrides: Row = {}): Row[] => [
  { id: P_ALICE, conversationId: DM, userId: ALICE, role: 'creator', isActive: true, permissions: { ...FOUNDING_MEMBER_PERMISSIONS, canSendImages: false } },
  { id: P_BOB, conversationId: DM, userId: BOB, role: 'member', isActive: true, messageRequestAt: new Date('2026-11-01T08:00:00.000Z'), messageRequestRisk: 10, messageRequestFromId: ALICE, ...overrides },
];

describe('decideDirectOpening — direct dès Connaissance, demande en dessous (MSG-01)', () => {
  it('une Connaissance écrit directement', async () => {
    await expect(decideDirectOpening(db(monde()), { senderId: ALICE, recipientId: CONNAISSANCE, now: NOW })).resolves.toEqual({ kind: 'direct' });
  });

  it('un inconnu passe par la boîte de demandes', async () => {
    const opening = await decideDirectOpening(db(monde()), { senderId: ALICE, recipientId: BOB, now: NOW });
    expect(opening).toMatchObject({ kind: 'request', recipientMinor: false });
  });

  it('vers un mineur déclaré, la porte répond comme vers un majeur ; la demande est CONTENUE (score plafond, filtrée)', async () => {
    const opening = await decideDirectOpening(db(monde()), { senderId: ALICE, recipientId: MINEUR, now: NOW });
    expect(opening).toEqual({ kind: 'request', risk: 100, recipientMinor: true });
  });

  it('un co-membre d\'une communauté peut adresser une demande à un mineur — ses médias restent fermés', async () => {
    const opening = await decideDirectOpening(db(monde()), { senderId: ALICE, recipientId: CO_MEMBRE_MINEUR, now: NOW });
    expect(opening).toMatchObject({ kind: 'request', recipientMinor: true });
    if (opening.kind !== 'request') throw new Error('demande attendue');
    const permissions = requesterPermissionsFor(opening, FOUNDING_MEMBER_PERMISSIONS);
    expect(permissions).toMatchObject({ canSendMessages: true, canSendFiles: false, canSendImages: false, canSendVideos: false, canSendAudios: false });
  });

  it('une demande vers un majeur ferme aussi les médias de l\'expéditeur : la règle ne dépend pas de l\'âge (C1)', async () => {
    const versMajeur = await decideDirectOpening(db(monde()), { senderId: ALICE, recipientId: BOB, now: NOW });
    const versMineur = await decideDirectOpening(db(monde()), { senderId: ALICE, recipientId: MINEUR, now: NOW });
    expect(requesterPermissionsFor(versMajeur, FOUNDING_MEMBER_PERMISSIONS)).toEqual(requesterPermissionsFor(versMineur, FOUNDING_MEMBER_PERMISSIONS));
    expect(requesterPermissionsFor({ kind: 'direct' }, FOUNDING_MEMBER_PERMISSIONS)).toEqual(FOUNDING_MEMBER_PERMISSIONS);
  });

  it('le participant destinataire d\'une demande porte sa date et son score ; un direct n\'en porte rien', async () => {
    const opening = await decideDirectOpening(db(monde()), { senderId: NOUVEAU, recipientId: BOB, now: NOW });
    expect(requestRecipientFields(opening, NOW, NOUVEAU)).toEqual({ messageRequestAt: NOW, messageRequestRisk: expect.any(Number), messageRequestFromId: NOUVEAU });
    expect(requestRecipientFields({ kind: 'direct' }, NOW, NOUVEAU)).toEqual({ messageRequestAt: null, messageRequestRisk: null, messageRequestFromId: null });
  });

  it('un compte neuf qui ouvre beaucoup de demandes est filtré', async () => {
    const recentes = Array.from({ length: 12 }, (_, i) => ({
      id: `62000000000000000000f${String(i).padStart(3, '0')}`,
      conversationId: `6200000000000000000d${String(i).padStart(4, '0')}`,
      userId: NOUVEAU,
      role: 'creator',
      joinedAt: new Date(NOW.getTime() - HOURS),
    }));
    const opening = await decideDirectOpening(db(monde({ participants: recentes })), { senderId: NOUVEAU, recipientId: BOB, now: NOW });
    if (opening.kind !== 'request') throw new Error('demande attendue');
    expect(opening.risk).toBeGreaterThanOrEqual(MESSAGE_REQUEST_FILTER_THRESHOLD);
  });
});

describe('decideOpenings — un groupe ne débloque rien (RG-22, audit M1)', () => {
  it('chaque membre hors Connaissance du créateur entre par sa boîte ; la Connaissance entre directement', async () => {
    const openings = await decideOpenings(db(monde()), { senderId: ALICE, recipientIds: [CONNAISSANCE, BOB, MINEUR], now: NOW });
    expect(openings.get(CONNAISSANCE)).toEqual({ kind: 'direct' });
    expect(openings.get(BOB)).toMatchObject({ kind: 'request', recipientMinor: false });
    expect(openings.get(MINEUR)).toEqual({ kind: 'request', risk: 100, recipientMinor: true });
  });

  it('une communauté commune ne lève pas le bouclier (audit B3)', async () => {
    const openings = await decideOpenings(db(monde()), { senderId: ALICE, recipientIds: [CO_MEMBRE_MINEUR], now: NOW });
    expect(openings.get(CO_MEMBRE_MINEUR)).toEqual({ kind: 'request', risk: 100, recipientMinor: true });
  });
});

describe('messageRequestRiskScore — un score borné, renforcé pour un mineur (MIN-03)', () => {
  const base = { senderAccountAgeHours: 24 * 400, senderRequestsLast24h: 0, sharesCommunity: true, recipientMinor: false };

  it('un compte ancien, sans rafale, d\'une communauté commune passe sous le seuil', () => {
    expect(messageRequestRiskScore(base)).toBeLessThan(MESSAGE_REQUEST_FILTER_THRESHOLD);
  });

  it('chaque signal pèse, et le total ne dépasse jamais 100', () => {
    const pire = { senderAccountAgeHours: 1, senderRequestsLast24h: 50, sharesCommunity: false, recipientMinor: true };
    expect(messageRequestRiskScore(pire)).toBe(100);
    expect(messageRequestRiskScore({ ...base, sharesCommunity: false })).toBeGreaterThan(messageRequestRiskScore(base));
    expect(messageRequestRiskScore({ ...base, senderAccountAgeHours: null })).toBeGreaterThan(messageRequestRiskScore(base));
  });

  it('la même demande vers un mineur est filtrée quand elle ne l\'est pas vers un majeur', () => {
    const signals = { ...base, sharesCommunity: false, senderAccountAgeHours: 24 * 3 };
    expect(messageRequestRiskScore(signals)).toBeLessThan(MESSAGE_REQUEST_FILTER_THRESHOLD);
    expect(messageRequestRiskScore({ ...signals, recipientMinor: true })).toBeGreaterThanOrEqual(MESSAGE_REQUEST_FILTER_THRESHOLD);
  });
});

describe('servedMessageRequest — ce que le destinataire reçoit', () => {
  it('une demande se sert datée, filtrée selon son score, médias floutés', () => {
    expect(servedMessageRequest({ messageRequestAt: new Date('2026-11-01T08:00:00.000Z'), messageRequestRisk: 80, messageRequestFromId: ALICE })).toEqual({
      since: '2026-11-01T08:00:00.000Z',
      filtered: true,
      mediaBlurred: true,
      answered: false,
    });
    expect(servedMessageRequest({ messageRequestAt: new Date('2026-11-01T08:00:00.000Z'), messageRequestRisk: null })?.filtered).toBe(false);
  });

  it('une conversation ordinaire ne porte aucune demande', () => {
    expect(servedMessageRequest({})).toBeNull();
    expect(servedMessageRequest({ messageRequestAt: null })).toBeNull();
  });

  it('une demande à laquelle on a répondu sans la consommer (groupe, ou tête-à-tête avant #16053) reste à accepter : hors de la boîte, médias toujours floutés', () => {
    expect(servedMessageRequest({ messageRequestAt: null, messageRequestRisk: null, messageRequestFromId: ALICE })).toEqual({
      since: null,
      filtered: false,
      mediaBlurred: true,
      answered: true,
    });
  });

});

describe('acceptMessageRequest — accepter fait passer l\'expéditeur au moins en Connaissance (MSG-02)', () => {
  it('efface la demande, rouvre les médias de l\'expéditeur et relève le lien des deux côtés', async () => {
    const world = monde({ participants: demandeEnAttente() });
    await expect(acceptMessageRequest(db(world), { conversationId: DM, userId: BOB, now: NOW })).resolves.toEqual({ kind: 'accepted', requesterId: ALICE, requesterParticipantId: P_ALICE, levelRaised: true });

    const bob = world.participant.rows.find((p) => p.id === P_BOB);
    const alice = world.participant.rows.find((p) => p.id === P_ALICE);
    expect(bob?.messageRequestAt).toBeNull();
    expect(bob?.messageRequestRisk).toBeNull();
    expect(alice?.permissions).toEqual(FOUNDING_MEMBER_PERMISSIONS);
    expect(world.conversation.rows.find((c) => c.id === DM)?.updatedAt).toEqual(NOW);
    expect(world.relations.relations()).toEqual(
      expect.arrayContaining([expect.objectContaining({ grantedByLow: 'ACQUAINTANCE', grantedByHigh: 'ACQUAINTANCE' })]),
    );
  });

  it('l\'expéditeur ne peut pas accepter sa propre demande', async () => {
    const world = monde({ participants: demandeEnAttente() });
    await expect(acceptMessageRequest(db(world), { conversationId: DM, userId: ALICE, now: NOW })).resolves.toEqual({ kind: 'not-pending' });
    expect(world.relations.relations()).toHaveLength(1);
  });

  it('accepter deux fois ne relève rien de plus et ne dit rien', async () => {
    const world = monde({ participants: demandeEnAttente() });
    await acceptMessageRequest(db(world), { conversationId: DM, userId: BOB, now: NOW });
    await expect(acceptMessageRequest(db(world), { conversationId: DM, userId: BOB, now: NOW })).resolves.toEqual({ kind: 'not-pending' });
  });

  it('un blocage entre les deux sort la demande de la boîte sans relever aucun lien (audit 3, M-a ; ce que deviennent les médias après un déblocage : #14530)', async () => {
    const world = monde({ participants: demandeEnAttente(), users: [] });
    world.users.rows.find((u) => u.id === ALICE)!.blockedUserIds = [BOB];
    await expect(acceptMessageRequest(db(world), { conversationId: DM, userId: BOB, now: NOW })).resolves.toEqual({ kind: 'accepted', requesterId: null, requesterParticipantId: null, levelRaised: false });
    expect(world.participant.rows.find((p) => p.id === P_BOB)?.messageRequestAt).toBeNull();
    expect(world.relations.relations()).toHaveLength(1);
  });

  it('une panne en rouvrant les médias laisse la demande en attente : le rejeu termine (audit 4, F-e)', async () => {
    const world = monde({ participants: demandeEnAttente() });
    const base = db(world) as unknown as { participant: { updateMany: (args: { data?: { permissions?: unknown } }) => Promise<{ count: number }> } };
    let pannes = 0;
    const prisma = { ...base, participant: { ...base.participant, updateMany: async (args: { data?: { permissions?: unknown } }) => {
      if (args?.data?.permissions && ++pannes === 1) throw new Error('mongo: connection reset');
      return base.participant.updateMany(args as never);
    } } } as unknown as PrismaClient;
    await expect(acceptMessageRequest(prisma, { conversationId: DM, userId: BOB, now: NOW })).rejects.toThrow('connection reset');
    await expect(acceptMessageRequest(prisma, { conversationId: DM, userId: BOB, now: NOW })).resolves.toMatchObject({ kind: 'accepted', requesterId: ALICE });
    expect(world.participant.rows.find((p) => p.id === P_ALICE)?.permissions).toEqual(FOUNDING_MEMBER_PERMISSIONS);
  });

  it.each([['un majeur', BOB]])('dans un tête-à-tête, la réponse de %s vaut accord : médias rouverts, demande consommée, aucun lien relevé (#16053, remplace audit 3 H1)', async (_label, recipient) => {
    const world = monde({ participants: demandeEnAttente({ userId: recipient }) });
    await expect(answerMessageRequest(db(world), { conversationId: DM, userId: recipient, now: NOW })).resolves.toEqual({ answered: true, requesterParticipantId: P_ALICE });
    expect(world.participant.rows.find((p) => p.id === P_ALICE)?.permissions).toEqual(FOUNDING_MEMBER_PERMISSIONS);
    expect(world.participant.rows.find((p) => p.id === P_BOB)).toMatchObject({ messageRequestAt: null, messageRequestRisk: null, messageRequestFromId: null });
    expect(world.relations.relations().some((r) => [r.userLowId, r.userHighId].includes(recipient))).toBe(false);
    expect(world.conversation.rows.find((c) => c.id === DM)?.updatedAt).toEqual(NOW);
    await expect(acceptMessageRequest(db(world), { conversationId: DM, userId: recipient, now: NOW })).resolves.toEqual({ kind: 'not-pending' });
  });

  it('une demande que le bouclier CONTIENT (mineur face à un inconnu, RG-21) : la réponse la sort de la boîte sans rouvrir aucun média — seul « Accepter » le fait (#16053, audit C1)', async () => {
    const world = monde({ participants: demandeEnAttente({ userId: MINEUR }) });
    await expect(answerMessageRequest(db(world), { conversationId: DM, userId: MINEUR, now: NOW })).resolves.toEqual({ answered: true, requesterParticipantId: null });
    expect(world.participant.rows.find((p) => p.id === P_ALICE)?.permissions).toMatchObject({ canSendImages: false });
    expect(world.participant.rows.find((p) => p.id === P_BOB)).toMatchObject({ messageRequestAt: null, messageRequestFromId: ALICE });
    await expect(answerMessageRequest(db(world), { conversationId: DM, userId: MINEUR, now: NOW })).resolves.toEqual({ answered: false, requesterParticipantId: null });
    await expect(acceptMessageRequest(db(world), { conversationId: DM, userId: MINEUR, now: NOW })).resolves.toMatchObject({ kind: 'accepted', requesterId: ALICE, levelRaised: true });
    expect(world.participant.rows.find((p) => p.id === P_ALICE)?.permissions).toEqual(FOUNDING_MEMBER_PERMISSIONS);
  });

  it('une réponse déjà donnée sous l\'ancienne règle (provenance seule) vaut accord à la suivante (#16053)', async () => {
    const world = monde({ participants: demandeEnAttente({ messageRequestAt: null, messageRequestRisk: null }) });
    await expect(answerMessageRequest(db(world), { conversationId: DM, userId: BOB, now: NOW })).resolves.toEqual({ answered: true, requesterParticipantId: P_ALICE });
    expect(world.participant.rows.find((p) => p.id === P_ALICE)?.permissions).toEqual(FOUNDING_MEMBER_PERMISSIONS);
    expect(world.participant.rows.find((p) => p.id === P_BOB)?.messageRequestFromId).toBeNull();
  });

  it('répondre à quelqu\'un qu\'on a bloqué lève la demande sans rouvrir aucun média (#16053, mêmes gardes qu\'Accepter)', async () => {
    const world = monde({ participants: demandeEnAttente() });
    world.users.rows.find((u) => u.id === BOB)!.blockedUserIds = [ALICE];
    await expect(answerMessageRequest(db(world), { conversationId: DM, userId: BOB, now: NOW })).resolves.toEqual({ answered: true, requesterParticipantId: null });
    expect(world.participant.rows.find((p) => p.id === P_ALICE)?.permissions).toMatchObject({ canSendImages: false });
    expect(world.participant.rows.find((p) => p.id === P_BOB)).toMatchObject({ messageRequestAt: null, messageRequestFromId: null });
  });

  it('répondre quand l\'expéditeur est parti lève la demande sans toucher sa ligne (#16053)', async () => {
    const world = monde({ participants: demandeEnAttente() });
    world.participant.rows.find((p) => p.id === P_ALICE)!.isActive = false;
    await expect(answerMessageRequest(db(world), { conversationId: DM, userId: BOB, now: NOW })).resolves.toEqual({ answered: true, requesterParticipantId: null });
    expect(world.participant.rows.find((p) => p.id === P_ALICE)?.permissions).toMatchObject({ canSendImages: false });
  });

  it('l\'expéditeur qui « répond » à sa propre demande ne rouvre rien', async () => {
    const world = monde({ participants: demandeEnAttente() });
    await expect(answerMessageRequest(db(world), { conversationId: DM, userId: ALICE, now: NOW })).resolves.toEqual({ answered: false, requesterParticipantId: null });
    expect(world.participant.rows.find((p) => p.id === P_ALICE)?.permissions).toMatchObject({ canSendImages: false });
    expect(world.participant.rows.find((p) => p.id === P_BOB)?.messageRequestAt).toBeInstanceOf(Date);
  });

  it('accepter puis répondre : la réponse ne défait rien, la demande reste acceptée', async () => {
    const world = monde({ participants: demandeEnAttente() });
    await acceptMessageRequest(db(world), { conversationId: DM, userId: BOB, now: NOW });
    await expect(answerMessageRequest(db(world), { conversationId: DM, userId: BOB, now: NOW })).resolves.toEqual({ answered: false, requesterParticipantId: null });
    expect(world.participant.rows.find((p) => p.id === P_ALICE)?.permissions).toEqual(FOUNDING_MEMBER_PERMISSIONS);
  });

  it('la réouverture des médias relit la ligne de l\'expéditeur : un droit changé entre-temps survit (audit 3, F-c)', async () => {
    const world = monde({ participants: demandeEnAttente() });
    const create = world.relations.prisma.userRelation.create.bind(world.relations.prisma.userRelation);
    world.relations.prisma.userRelation.create = (async (args: never) => {
      const alice = world.participant.rows.find((p) => p.id === P_ALICE)!;
      alice.permissions = { ...(alice.permissions as object), canSendMessages: false };
      return create(args);
    }) as never;
    await acceptMessageRequest(db(world), { conversationId: DM, userId: BOB, now: NOW });
    expect(world.participant.rows.find((p) => p.id === P_ALICE)?.permissions).toMatchObject({ canSendMessages: false, canSendImages: true });
  });

  it('un lien déjà plus haut ne baisse pas', async () => {
    const world = monde({ participants: demandeEnAttente(), links: [[ALICE, BOB, 'FRIEND']] });
    await acceptMessageRequest(db(world), { conversationId: DM, userId: BOB, now: NOW });
    expect(world.relations.relations()).toEqual(expect.arrayContaining([expect.objectContaining({ grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND' })]));
  });
});

describe('answerMessageRequest — dans un GROUPE, une réponse ne débloque rien (RG-22)', () => {
  const GROUPE = '6200000000000000000000d2';
  const groupe = () => {
    const world = monde({
      participants: [
        { id: 'g-alice', conversationId: GROUPE, userId: ALICE, role: 'admin', isActive: true, permissions: { canSendImages: false } },
        { id: 'g-bob', conversationId: GROUPE, userId: BOB, role: 'member', isActive: true, messageRequestAt: new Date('2026-11-01T08:00:00.000Z'), messageRequestRisk: 10, messageRequestFromId: ALICE },
      ],
    });
    world.conversation.rows.push({ id: GROUPE, type: 'group' });
    return world;
  };

  it('la conversation quitte la boîte, la provenance reste, aucun droit ni lien ne bouge', async () => {
    const world = groupe();
    await expect(answerMessageRequest(db(world), { conversationId: GROUPE, userId: BOB, now: NOW })).resolves.toEqual({ answered: true, requesterParticipantId: null });
    expect(world.participant.rows.find((p) => p.id === 'g-bob')).toMatchObject({ messageRequestAt: null, messageRequestFromId: ALICE });
    expect(world.participant.rows.find((p) => p.id === 'g-alice')?.permissions).toEqual({ canSendImages: false });
    expect(world.relations.relations().some((r) => [r.userLowId, r.userHighId].includes(BOB))).toBe(false);
  });

  it('une seconde réponse dans le groupe n\'écrit rien', async () => {
    const world = groupe();
    await answerMessageRequest(db(world), { conversationId: GROUPE, userId: BOB, now: NOW });
    await expect(answerMessageRequest(db(world), { conversationId: GROUPE, userId: BOB, now: NOW })).resolves.toEqual({ answered: false, requesterParticipantId: null });
  });
});

describe('noteMessageInteractions — répondre à une demande l\'accepte', () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const reply = (world: ReturnType<typeof monde>, sender: string, type: 'direct' | 'group' = 'direct') => {
    const prisma = {
      ...world.prisma,
      conversation: {
        ...world.conversation,
        findUnique: async () => ({ type, participants: world.participant.rows.map((p) => ({ userId: p.userId, messageRequestAt: p.messageRequestAt ?? null, messageRequestFromId: p.messageRequestFromId ?? null })) }),
        updateMany: world.conversation.updateMany,
      },
      pairInteractionDay: { update: async () => ({}), create: async () => ({}) },
    };
    noteMessageInteractions(prisma as never, {
      conversationId: DM, senderUserId: sender, messageSource: 'user', messageType: 'text', encryptionMode: null,
      attachmentMimeTypes: [], replyToAuthorUserId: null, mentionedUserIds: [], at: NOW,
    });
  };

  it('le destinataire qui répond vaut accord : la demande est consommée, les médias de l\'expéditeur rouverts, son cache de droits oublié, aucun lien relevé (#16053)', async () => {
    const world = monde({ participants: demandeEnAttente() });
    cacheParticipant(P_ALICE, DM, { id: P_ALICE, conversationId: DM, isActive: true, permissions: { ...FOUNDING_MEMBER_PERMISSIONS, canSendImages: false } as never, anonymousSession: null });
    reply(world, BOB);
    for (let i = 0; i < 20; i += 1) await flush();
    expect(world.participant.rows.find((p) => p.id === P_BOB)).toMatchObject({ messageRequestAt: null, messageRequestFromId: null });
    expect(world.relations.relations().some((r) => [r.userLowId, r.userHighId].includes(BOB))).toBe(false);
    expect(world.participant.rows.find((p) => p.id === P_ALICE)?.permissions).toEqual(FOUNDING_MEMBER_PERMISSIONS);
    expect(getCachedParticipant(P_ALICE, DM)).toBeUndefined();
  });

  it('une conversation déjà répondue sous l\'ancienne règle se débloque à la réponse suivante (#16053)', async () => {
    const world = monde({ participants: demandeEnAttente({ messageRequestAt: null, messageRequestRisk: null }) });
    reply(world, BOB);
    for (let i = 0; i < 20; i += 1) await flush();
    expect(world.participant.rows.find((p) => p.id === P_ALICE)?.permissions).toEqual(FOUNDING_MEMBER_PERMISSIONS);
    expect(world.participant.rows.find((p) => p.id === P_BOB)?.messageRequestFromId).toBeNull();
  });

  it('après une baisse volontaire, répondre efface la demande sans recréer le lien (RG-07)', async () => {
    const world = monde({ participants: demandeEnAttente() });
    await world.relations.prisma.userRelation.create({
      data: { userLowId: ALICE < BOB ? ALICE : BOB, userHighId: ALICE < BOB ? BOB : ALICE, grantedByLow: 'PUBLIC', grantedByHigh: 'PUBLIC',
        origin: 'request', levelSince: NOW, transitions: [{ actorId: BOB, from: 'FRIEND', to: 'PUBLIC', at: new Date('2026-10-01T00:00:00Z') }] },
    } as never);
    reply(world, BOB);
    for (let i = 0; i < 20; i += 1) await flush();
    expect(world.participant.rows.find((p) => p.id === P_BOB)?.messageRequestAt).toBeNull();
    expect(world.relations.relations().find((r) => [r.userLowId, r.userHighId].includes(BOB))).toMatchObject({ grantedByLow: 'PUBLIC', grantedByHigh: 'PUBLIC' });
  });

  it('un mineur que le bouclier protège encore répond : la demande quitte la boîte, aucun média ni lien (RG-21, audit C1)', async () => {
    const world = monde({ participants: demandeEnAttente({ userId: MINEUR }) });
    reply(world, MINEUR);
    for (let i = 0; i < 20; i += 1) await flush();
    expect(world.participant.rows.find((p) => p.id === P_BOB)).toMatchObject({ messageRequestAt: null, messageRequestFromId: ALICE });
    expect(world.participant.rows.find((p) => p.id === P_ALICE)?.permissions).toMatchObject({ canSendImages: false });
    expect(world.relations.relations().some((r) => [r.userLowId, r.userHighId].includes(MINEUR))).toBe(false);
  });

  it('dans un groupe, une ligne qui ne porte plus que la provenance ne déclenche rien (RG-22, audit C3)', async () => {
    const world = monde({ participants: demandeEnAttente({ messageRequestAt: null, messageRequestRisk: null }) });
    const writes: unknown[] = [];
    const updateMany = world.participant.updateMany.bind(world.participant);
    world.participant.updateMany = (async (args: unknown) => { writes.push(args); return updateMany(args as never); }) as never;
    reply(world, BOB, 'group');
    for (let i = 0; i < 20; i += 1) await flush();
    expect(writes).toEqual([]);
    expect(world.participant.rows.find((p) => p.id === P_ALICE)?.permissions).toMatchObject({ canSendImages: false });
    expect(world.participant.rows.find((p) => p.id === P_BOB)?.messageRequestFromId).toBe(ALICE);
  });

  it('l\'expéditeur qui relance n\'accepte rien', async () => {
    const world = monde({ participants: demandeEnAttente() });
    reply(world, ALICE);
    for (let i = 0; i < 20; i += 1) await flush();
    expect(world.participant.rows.find((p) => p.id === P_BOB)?.messageRequestAt).toBeInstanceOf(Date);
    expect(world.participant.rows.find((p) => p.id === P_ALICE)?.permissions).toMatchObject({ canSendImages: false });
  });
});

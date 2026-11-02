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
  acceptRequestOnReply,
  decideDirectOpening,
  loadViewerMessageRequests,
  messageRequestRiskScore,
  requesterPermissionsFor,
  requestRecipientFields,
  servedMessageRequest,
} from '../../../../services/messaging/messageRequests';
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
  { id: P_BOB, conversationId: DM, userId: BOB, role: 'member', isActive: true, messageRequestAt: new Date('2026-11-01T08:00:00.000Z'), messageRequestRisk: 10, ...overrides },
];

describe('decideDirectOpening — direct dès Connaissance, demande en dessous (MSG-01)', () => {
  it('une Connaissance écrit directement', async () => {
    await expect(decideDirectOpening(db(monde()), { senderId: ALICE, recipientId: CONNAISSANCE, now: NOW })).resolves.toEqual({ kind: 'direct' });
  });

  it('un inconnu passe par la boîte de demandes', async () => {
    const opening = await decideDirectOpening(db(monde()), { senderId: ALICE, recipientId: BOB, now: NOW });
    expect(opening).toMatchObject({ kind: 'request', recipientMinor: false });
  });

  it('le Public ne peut pas écrire à un mineur déclaré (RG-21), et le refus ne dit pas pourquoi', async () => {
    await expect(decideDirectOpening(db(monde()), { senderId: ALICE, recipientId: MINEUR, now: NOW })).resolves.toEqual({ kind: 'refused' });
  });

  it('un co-membre d\'une communauté peut adresser une demande à un mineur — ses médias restent fermés', async () => {
    const opening = await decideDirectOpening(db(monde()), { senderId: ALICE, recipientId: CO_MEMBRE_MINEUR, now: NOW });
    expect(opening).toMatchObject({ kind: 'request', recipientMinor: true });
    if (opening.kind !== 'request') throw new Error('demande attendue');
    const permissions = requesterPermissionsFor(opening, FOUNDING_MEMBER_PERMISSIONS);
    expect(permissions).toMatchObject({ canSendMessages: true, canSendFiles: false, canSendImages: false, canSendVideos: false, canSendAudios: false });
  });

  it('une demande vers un majeur garde les droits fondateurs de l\'expéditeur', async () => {
    const opening = await decideDirectOpening(db(monde()), { senderId: ALICE, recipientId: BOB, now: NOW });
    expect(requesterPermissionsFor(opening, FOUNDING_MEMBER_PERMISSIONS)).toEqual(FOUNDING_MEMBER_PERMISSIONS);
  });

  it('le participant destinataire d\'une demande porte sa date et son score ; un direct n\'en porte rien', async () => {
    const opening = await decideDirectOpening(db(monde()), { senderId: NOUVEAU, recipientId: BOB, now: NOW });
    expect(requestRecipientFields(opening, NOW)).toEqual({ messageRequestAt: NOW, messageRequestRisk: expect.any(Number) });
    expect(requestRecipientFields({ kind: 'direct' }, NOW)).toEqual({});
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
    expect(servedMessageRequest({ messageRequestAt: new Date('2026-11-01T08:00:00.000Z'), messageRequestRisk: 80 })).toEqual({
      since: '2026-11-01T08:00:00.000Z',
      filtered: true,
      mediaBlurred: true,
    });
    expect(servedMessageRequest({ messageRequestAt: new Date('2026-11-01T08:00:00.000Z'), messageRequestRisk: null })?.filtered).toBe(false);
  });

  it('une conversation ordinaire ne porte aucune demande', () => {
    expect(servedMessageRequest({})).toBeNull();
    expect(servedMessageRequest({ messageRequestAt: null })).toBeNull();
  });

  it('ne charge que les demandes du LECTEUR, jamais celles d\'un autre participant', async () => {
    const world = monde({ participants: demandeEnAttente() });
    const pourBob = await loadViewerMessageRequests(db(world), BOB, [DM]);
    const pourAlice = await loadViewerMessageRequests(db(world), ALICE, [DM]);
    expect(pourBob.get(DM)).toMatchObject({ filtered: false });
    expect(pourAlice.size).toBe(0);
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

  it('un blocage entre les deux interdit l\'acceptation', async () => {
    const world = monde({ participants: demandeEnAttente(), users: [] });
    world.users.rows.find((u) => u.id === ALICE)!.blockedUserIds = [BOB];
    await expect(acceptMessageRequest(db(world), { conversationId: DM, userId: BOB, now: NOW })).resolves.toEqual({ kind: 'not-pending' });
    expect(world.participant.rows.find((p) => p.id === P_BOB)?.messageRequestAt).toBeInstanceOf(Date);
  });

  it('un lien déjà plus haut ne baisse pas', async () => {
    const world = monde({ participants: demandeEnAttente(), links: [[ALICE, BOB, 'FRIEND']] });
    await acceptMessageRequest(db(world), { conversationId: DM, userId: BOB, now: NOW });
    expect(world.relations.relations()).toEqual(expect.arrayContaining([expect.objectContaining({ grantedByLow: 'FRIEND', grantedByHigh: 'FRIEND' })]));
  });
});

describe('acceptRequestOnReply — répondre à une demande l\'accepte', () => {
  it('le destinataire qui répond accepte', async () => {
    const world = monde({ participants: demandeEnAttente() });
    await expect(acceptRequestOnReply(db(world), { conversationId: DM, senderParticipantId: P_BOB, now: NOW })).resolves.toEqual({ kind: 'accepted', requesterId: ALICE, requesterParticipantId: P_ALICE, levelRaised: true });
  });

  it('l\'expéditeur qui relance n\'accepte rien', async () => {
    const world = monde({ participants: demandeEnAttente() });
    await expect(acceptRequestOnReply(db(world), { conversationId: DM, senderParticipantId: P_ALICE, now: NOW })).resolves.toEqual({ kind: 'not-pending' });
    expect(world.participant.rows.find((p) => p.id === P_BOB)?.messageRequestAt).toBeInstanceOf(Date);
  });
});

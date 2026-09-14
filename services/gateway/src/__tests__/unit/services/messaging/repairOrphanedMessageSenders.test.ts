/**
 * #6501 — `repairOrphanedMessageSenders`, la réparation UNIQUE des messages dont
 * le `Participant` expéditeur a disparu.
 *
 * `Message.sender` est une relation REQUISE : une seule ligne orpheline fait
 * rejeter par Prisma toute la lecture qui la charge, et la conversation devient
 * illisible pour tout le monde. La réparation a deux gestes, et chacun a ses
 * témoins :
 *
 * - l'avis d'arrivée d'un participant disparu n'annonce plus personne : il est
 *   EFFACÉ, et l'horloge de la conversation redescend sur son dernier message ;
 * - un message ÉCRIT garde sa place dans le fil des autres : il reçoit un
 *   participant tombstone « Compte supprimé », sous l'identifiant orphelin, sans
 *   réécrire le message — comme l'anonymisation d'un compte supprimé (#3632).
 *
 * Le double (`helpers/orphaned-sender-db.ts`) interprète les pipelines et tient
 * l'index unique de production : ce sont les LIGNES qui parlent, jamais la forme
 * des appels.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { JOIN_NOTICE_KIND } from '@meeshy/shared/utils/join-notice';
import {
  repairOrphanedMessageSenders,
  tombstoneSessionMarker,
  nullSenderTombstoneId,
} from '../../../../services/messaging/repairOrphanedMessageSenders';
import { DELETED_ACCOUNT_DISPLAY_NAME } from '../../../../services/messaging/deletedAccountDisplayName';
import { hashSessionToken, generateSessionToken } from '../../../../utils/session-token';
import {
  makeOrphanedSenderDb,
  type OrphanDbMessage,
  type OrphanDbParticipant,
  type OrphanDbSeed,
} from '../../../helpers/orphaned-sender-db';

const CONV = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const OTHER_CONV = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const GHOST = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const GHOST_2 = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const GHOST_3 = 'bbbbbbbbbbbbbbbbbbbbbbb3';
const MEMBER = 'ccccccccccccccccccccccc1';
const MEMBER_USER = 'ddddddddddddddddddddddd1';

const T1 = new Date('2026-09-14T03:00:00.000Z');
const T2 = new Date('2026-09-14T04:00:00.000Z');
const T3 = new Date('2026-09-14T05:00:00.000Z');

const conversation = (id: string, lastMessageAt: Date) => ({
  id,
  lastMessageAt,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
});

const member = (id = MEMBER, conversationId = CONV): OrphanDbParticipant => ({
  id,
  conversationId,
  userId: MEMBER_USER,
  type: 'user',
  displayName: 'Alice',
  sessionTokenHash: null,
});

const written = (id: string, senderId: string | null, createdAt: Date, conversationId = CONV): OrphanDbMessage => ({
  id,
  conversationId,
  senderId,
  messageSource: 'user',
  content: `texte ${id}`,
  createdAt,
});

const joinNotice = (id: string, senderId: string, createdAt: Date): OrphanDbMessage => ({
  id,
  conversationId: CONV,
  senderId,
  messageSource: 'system',
  messageType: 'system',
  content: 'Preuve a rejoint la conversation',
  metadata: {
    kind: JOIN_NOTICE_KIND,
    participantId: senderId,
    displayName: 'Preuve',
    isAnonymous: false,
    viaShareLink: false,
  },
  createdAt,
});

const callSummary = (id: string, senderId: string, createdAt: Date): OrphanDbMessage => ({
  id,
  conversationId: CONV,
  senderId,
  messageSource: 'system',
  messageType: 'system',
  content: 'Appel manqué',
  metadata: { kind: 'call-summary', callId: 'call-1' },
  createdAt,
});

const seeded = (seed: OrphanDbSeed) =>
  makeOrphanedSenderDb({ conversations: [conversation(CONV, T3)], participants: [member()], ...seed });

const participantById = (db: ReturnType<typeof makeOrphanedSenderDb>, id: string) =>
  db.state.participants.find((participant) => participant.id === id);

describe("#6501 — l'avis d'arrivée d'un participant disparu", () => {
  it("est effacé, sans fabriquer de tombstone, et l'horloge redescend sur le dernier message", async () => {
    const db = seeded({
      conversations: [conversation(CONV, T2)],
      messages: [written('m1', MEMBER, T1), joinNotice('avis', GHOST, T2)],
    });

    const result = await repairOrphanedMessageSenders(db.prisma as never, { conversationId: CONV });

    expect(result).toEqual({ deletedNotices: 1, tombstoned: 0, reassignedMessages: 0, failures: 0 });
    expect(db.state.messages.map((message) => message.id)).toEqual(['m1']);
    expect(db.state.participants.map((participant) => participant.id)).toEqual([MEMBER]);
    expect(db.state.conversations[0].lastMessageAt).toEqual(T1);
  });

  it("n'efface pas un message système d'une AUTRE famille — un résumé d'appel garde sa place", async () => {
    const db = seeded({ messages: [callSummary('appel', GHOST, T1)] });

    const result = await repairOrphanedMessageSenders(db.prisma as never, { conversationId: CONV });

    expect(result).toMatchObject({ deletedNotices: 0, tombstoned: 1 });
    expect(db.state.messages.map((message) => message.id)).toEqual(['appel']);
  });

  it("efface l'avis ET donne un auteur au message écrit du même disparu", async () => {
    const db = seeded({ messages: [joinNotice('avis', GHOST, T1), written('m1', GHOST, T2)] });

    const result = await repairOrphanedMessageSenders(db.prisma as never, { conversationId: CONV });

    expect(result).toEqual({ deletedNotices: 1, tombstoned: 1, reassignedMessages: 0, failures: 0 });
    expect(db.state.messages.map((message) => message.id)).toEqual(['m1']);
    expect(participantById(db, GHOST)?.displayName).toBe(DELETED_ACCOUNT_DISPLAY_NAME);
  });
});

describe("#6501 — un message écrit par un participant disparu", () => {
  it('reçoit un tombstone « Compte supprimé » sous l’identifiant orphelin, sans que le message soit réécrit', async () => {
    const db = seeded({ messages: [written('m1', GHOST, T1)] });

    const result = await repairOrphanedMessageSenders(db.prisma as never, { conversationId: CONV });

    expect(result).toEqual({ deletedNotices: 0, tombstoned: 1, reassignedMessages: 0, failures: 0 });
    expect(db.state.messages).toEqual([written('m1', GHOST, T1)]);
    const tombstone = participantById(db, GHOST);
    expect(tombstone).toMatchObject({
      id: GHOST,
      conversationId: CONV,
      type: 'user',
      userId: null,
      displayName: DELETED_ACCOUNT_DISPLAY_NAME,
      isActive: false,
      isOnline: false,
      sessionTokenHash: tombstoneSessionMarker(GHOST),
    });
    expect(tombstone?.leftAt).toBeInstanceOf(Date);
    expect(tombstone?.lastActiveAt).toEqual(new Date(0));
  });

  it("ne peut jamais s'authentifier : ni compte, ni session anonyme, ni participation active", async () => {
    const db = seeded({ messages: [written('m1', GHOST, T1)] });

    await repairOrphanedMessageSenders(db.prisma as never, { conversationId: CONV });

    const tombstone = participantById(db, GHOST);
    expect(tombstone?.userId).toBeNull();
    expect(tombstone?.type).not.toBe('anonymous');
    expect(tombstone?.isActive).toBe(false);
  });

  it("deux disparus d'une même conversation ne se percutent pas sur l'index unique de production", async () => {
    const db = seeded({ messages: [written('m1', GHOST, T1), written('m2', GHOST_2, T2)] });

    const result = await repairOrphanedMessageSenders(db.prisma as never, { conversationId: CONV });

    expect(result).toEqual({ deletedNotices: 0, tombstoned: 2, reassignedMessages: 0, failures: 0 });
    expect(participantById(db, GHOST)?.sessionTokenHash).not.toBe(participantById(db, GHOST_2)?.sessionTokenHash);
  });

  it('un expéditeur NUL ou ABSENT reçoit un tombstone neuf, et ses messages y sont réaffectés', async () => {
    const sansCle: OrphanDbMessage = { id: 'm2', conversationId: CONV, messageSource: 'agent', createdAt: T2 };
    const db = seeded({ messages: [written('m1', null, T1), sansCle] });

    const result = await repairOrphanedMessageSenders(db.prisma as never, { conversationId: CONV });

    const tombstoneId = nullSenderTombstoneId(CONV);
    expect(tombstoneId).toMatch(/^[0-9a-f]{24}$/);
    expect(result).toEqual({ deletedNotices: 0, tombstoned: 1, reassignedMessages: 2, failures: 0 });
    expect(db.state.messages.map((message) => message.senderId)).toEqual([tombstoneId, tombstoneId]);
    expect(participantById(db, tombstoneId)?.displayName).toBe(DELETED_ACCOUNT_DISPLAY_NAME);
  });

  it('rejouée, la réparation ne fabrique rien de plus', async () => {
    const db = seeded({ messages: [written('m1', GHOST, T1), written('m2', null, T2), joinNotice('avis', GHOST_2, T3)] });

    await repairOrphanedMessageSenders(db.prisma as never, { conversationId: CONV });
    const participants = db.state.participants.length;
    const second = await repairOrphanedMessageSenders(db.prisma as never, { conversationId: CONV });

    expect(second).toEqual({ deletedNotices: 0, tombstoned: 0, reassignedMessages: 0, failures: 0 });
    expect(db.state.participants).toHaveLength(participants);
  });

  it("un tombstone déjà posé par une passe concurrente n'est ni un échec, ni un doublon", async () => {
    const db = seeded({ messages: [written('m1', GHOST, T1)], concurrentParticipantCreate: [GHOST] });

    const result = await repairOrphanedMessageSenders(db.prisma as never, { conversationId: CONV });

    expect(result).toEqual({ deletedNotices: 0, tombstoned: 0, reassignedMessages: 0, failures: 0 });
    expect(db.state.participants.filter((participant) => participant.id === GHOST)).toHaveLength(1);
  });
});

describe('#6501 — la portée et la tenue de la réparation', () => {
  it("scopée à une conversation, elle ne touche pas aux orphelins d'une autre", async () => {
    const db = seeded({
      conversations: [conversation(CONV, T3), conversation(OTHER_CONV, T3)],
      messages: [written('m1', GHOST, T1), written('m2', GHOST_2, T2, OTHER_CONV)],
    });

    await repairOrphanedMessageSenders(db.prisma as never, { conversationId: CONV });

    expect(participantById(db, GHOST)).toBeDefined();
    expect(participantById(db, GHOST_2)).toBeUndefined();
  });

  it('sans portée, la passe est globale', async () => {
    const db = seeded({
      conversations: [conversation(CONV, T3), conversation(OTHER_CONV, T3)],
      messages: [written('m1', GHOST, T1), written('m2', GHOST_2, T2, OTHER_CONV)],
    });

    const result = await repairOrphanedMessageSenders(db.prisma as never);

    expect(result.tombstoned).toBe(2);
  });

  it('une liste de conversations VIDE ne déclenche jamais une passe globale', async () => {
    const db = seeded({ messages: [written('m1', GHOST, T1)] });

    const result = await repairOrphanedMessageSenders(db.prisma as never, { conversationIds: [] });

    expect(result).toEqual({ deletedNotices: 0, tombstoned: 0, reassignedMessages: 0, failures: 0 });
    expect(db.prisma.message.aggregateRaw).not.toHaveBeenCalled();
  });

  it("un message d'une conversation disparue n'engendre aucun participant", async () => {
    const db = makeOrphanedSenderDb({ messages: [written('m1', GHOST, T1, OTHER_CONV)] });

    const result = await repairOrphanedMessageSenders(db.prisma as never);

    expect(result.tombstoned).toBe(0);
    expect(db.state.participants).toEqual([]);
  });

  it('un échec reste local à sa ligne : il se compte, et les autres orphelins sont réparés', async () => {
    const db = seeded({
      messages: [written('m1', GHOST, T1), written('m2', GHOST_2, T2)],
      refuseParticipantCreate: [GHOST],
    });

    const result = await repairOrphanedMessageSenders(db.prisma as never, { conversationId: CONV });

    expect(result).toMatchObject({ tombstoned: 1, failures: 1 });
    expect(participantById(db, GHOST_2)).toBeDefined();
  });

  it('parcourt tous les orphelins par fournées bornées', async () => {
    const db = seeded({
      messages: [written('m1', GHOST, T1), written('m2', GHOST_2, T2), written('m3', GHOST_3, T3)],
    });

    const result = await repairOrphanedMessageSenders(db.prisma as never, { conversationId: CONV, batchSize: 1 });

    expect(result.tombstoned).toBe(3);
  });
});

describe('#6501 — le marqueur de session du tombstone', () => {
  const SHA256_HEX = /^[0-9a-f]{64}$/;

  it("n'a pas la forme d'un hachage de jeton : aucune session ne peut l'élire", () => {
    expect(tombstoneSessionMarker(GHOST)).not.toMatch(SHA256_HEX);
  });

  it('tout hachage de jeton, même du marqueur lui-même, a la forme que le marqueur n’a pas', () => {
    const jetons = [tombstoneSessionMarker(GHOST), GHOST, '', 'tombstone:', generateSessionToken(), generateSessionToken('appareil')];

    expect(jetons.map(hashSessionToken).filter((hash) => !SHA256_HEX.test(hash))).toEqual([]);
  });
});

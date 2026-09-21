/**
 * Témoin de parité — #7199 (G2).
 *
 * `MessageReadStatusService.getUnreadCountsForParticipants` (une conversation,
 * plusieurs participants — le push temps réel) et `.getUnreadCountsForUser`
 * (un utilisateur, plusieurs conversations — la liste) calculaient le même
 * concept par DEUX algorithmes distincts (doc-comment historique,
 * `MessageReadStatusService.ts:321-324` : « Fixing one alone would replace a
 * wrong-but-stable badge with a badge that changes value depending on which
 * path last spoke »). Ce fichier nourrit les deux chemins avec la MÊME base
 * (mêmes messages, même curseur, même masquage personnel) et exige le MÊME
 * compte — puis prouve, sur le module partagé `unreadCountsCore`, que c'est
 * bien UNE seule implémentation qui répond aux deux.
 *
 * Fichier NEUF (et non un ajout à `MessageReadStatusService.test.ts`, déjà
 * hors budget à 5264 lignes) — cadrage #7199.
 */

import { MessageReadStatusService } from '../../../services/MessageReadStatusService';
import {
  computeUnreadCounts,
  unreadFloorFor,
} from '../../../services/unreadCountsCore';
import { NO_PERSONAL_HIDING } from '../../../services/personalHistoryFilter';

const mockPrisma: any = {
  conversationReadCursor: { findMany: jest.fn() },
  participant: { findMany: jest.fn() },
  message: { findMany: jest.fn(), count: jest.fn() },
  userConversationPreferences: { findMany: jest.fn() },
  userMessageDeletion: { findMany: jest.fn() },
};

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

const CONVERSATION_ID = 'conv-parity-1';
const USER_ID = 'user-parity-1';
const PARTICIPANT_ID = 'participant-parity-1';

describe('unread counts — parité getUnreadCountsForParticipants / getUnreadCountsForUser', () => {
  let service: MessageReadStatusService;

  beforeEach(() => {
    // `resetAllMocks` (pas `clearAllMocks`) : chaque test pose son propre jeu
    // de `mockResolvedValueOnce`, et un chemin qui n'appelle PAS un mock donné
    // laisserait sinon une valeur en file, consommée par erreur au test
    // suivant — `clearAllMocks` n'efface que l'historique d'appels, jamais la
    // file d'implémentations « once ».
    jest.resetAllMocks();
    mockPrisma.userConversationPreferences.findMany.mockResolvedValue([]);
    mockPrisma.userMessageDeletion.findMany.mockResolvedValue([]);
    service = new MessageReadStatusService(mockPrisma);
  });

  const candidateRows = (rows: ReadonlyArray<{ at: string; from: string; id?: string }>) =>
    rows.map((r) => ({ id: r.id ?? `${r.from}-${r.at}`, createdAt: new Date(r.at), senderId: r.from }));

  const participantRow = (overrides: Partial<{ joinedAt: Date | null }> = {}) => ({
    id: PARTICIPANT_ID,
    userId: USER_ID,
    conversationId: CONVERSATION_ID,
    joinedAt: overrides.joinedAt ?? new Date('2024-01-01T00:00:00Z'),
  });

  it('renvoie le MÊME compte nominal sur les deux chemins (curseur position, messages d’autrui + un message propre)', async () => {
    const cursorRow = {
      participantId: PARTICIPANT_ID,
      lastReadAt: new Date('2024-01-01T18:00:00Z'),
      lastReadMessageCreatedAt: new Date('2024-01-01T10:00:00Z'),
    };
    const rows = candidateRows([
      { at: '2024-01-01T11:00:00Z', from: 'other' },
      { at: '2024-01-01T12:00:00Z', from: 'other' },
      { at: '2024-01-01T13:00:00Z', from: PARTICIPANT_ID }, // le propre message : exclu
    ]);

    // getUnreadCountsForParticipants
    mockPrisma.conversationReadCursor.findMany.mockResolvedValueOnce([cursorRow]);
    mockPrisma.message.findMany.mockResolvedValueOnce(rows);
    const viaParticipants = await service.getUnreadCountsForParticipants(
      [{ id: PARTICIPANT_ID, userId: USER_ID, joinedAt: new Date('2024-01-01T00:00:00Z') }],
      CONVERSATION_ID
    );

    // getUnreadCountsForUser
    mockPrisma.participant.findMany.mockResolvedValueOnce([participantRow()]);
    mockPrisma.conversationReadCursor.findMany.mockResolvedValueOnce([cursorRow]);
    mockPrisma.message.findMany.mockResolvedValueOnce(rows);
    const viaUser = await service.getUnreadCountsForUser(USER_ID, [CONVERSATION_ID]);

    expect(viaParticipants.get(PARTICIPANT_ID)).toBe(2);
    expect(viaUser.get(CONVERSATION_ID)).toBe(2);
    expect(viaParticipants.get(PARTICIPANT_ID)).toBe(viaUser.get(CONVERSATION_ID));
  });

  it('renvoie le MÊME compte quand le masquage personnel pose un cutoff (clearHistoryBefore)', async () => {
    // Cutoff à 11:30 : le message de 11:00 est masqué, celui de 12:00 compte.
    // `loadPersonalHistoryHidingByUser` (clé participant, DANS une conversation) et
    // `loadPersonalHistoryHidingByConversation` (clé conversation, POUR un user) lisent
    // la même table par une projection DIFFÉRENTE (`userId` vs `conversationId`) — même
    // ligne base, deux formes de retour, donc deux mocks distincts ici.
    const cutoff = new Date('2024-01-01T11:30:00Z');
    const rows = candidateRows([
      { at: '2024-01-01T11:00:00Z', from: 'other' },
      { at: '2024-01-01T12:00:00Z', from: 'other' },
    ]);

    mockPrisma.conversationReadCursor.findMany.mockResolvedValueOnce([]);
    mockPrisma.userConversationPreferences.findMany.mockResolvedValueOnce([
      { userId: USER_ID, clearHistoryBefore: cutoff },
    ]);
    mockPrisma.message.findMany.mockResolvedValueOnce(rows);
    const viaParticipants = await service.getUnreadCountsForParticipants(
      [{ id: PARTICIPANT_ID, userId: USER_ID, joinedAt: new Date('2024-01-01T00:00:00Z') }],
      CONVERSATION_ID
    );

    mockPrisma.participant.findMany.mockResolvedValueOnce([participantRow()]);
    mockPrisma.conversationReadCursor.findMany.mockResolvedValueOnce([]);
    mockPrisma.userConversationPreferences.findMany.mockResolvedValueOnce([
      { conversationId: CONVERSATION_ID, clearHistoryBefore: cutoff },
    ]);
    mockPrisma.message.findMany.mockResolvedValueOnce(rows);
    const viaUser = await service.getUnreadCountsForUser(USER_ID, [CONVERSATION_ID]);

    expect(viaParticipants.get(PARTICIPANT_ID)).toBe(1);
    expect(viaUser.get(CONVERSATION_ID)).toBe(1);
  });

  it('renvoie le MÊME compte quand un message est masqué individuellement (delete-for-me)', async () => {
    const rows = candidateRows([
      { at: '2024-01-01T11:00:00Z', from: 'other', id: 'msg-hidden' },
      { at: '2024-01-01T12:00:00Z', from: 'other', id: 'msg-visible' },
    ]);
    const deletionRow = { userId: USER_ID, messageId: 'msg-hidden' };

    mockPrisma.conversationReadCursor.findMany.mockResolvedValueOnce([]);
    mockPrisma.userMessageDeletion.findMany.mockResolvedValueOnce([deletionRow]);
    mockPrisma.message.findMany.mockResolvedValueOnce(rows);
    const viaParticipants = await service.getUnreadCountsForParticipants(
      [{ id: PARTICIPANT_ID, userId: USER_ID, joinedAt: new Date('2024-01-01T00:00:00Z') }],
      CONVERSATION_ID
    );

    mockPrisma.participant.findMany.mockResolvedValueOnce([participantRow()]);
    mockPrisma.conversationReadCursor.findMany.mockResolvedValueOnce([]);
    mockPrisma.userMessageDeletion.findMany.mockResolvedValueOnce([
      { userId: USER_ID, messageId: 'msg-hidden', message: { conversationId: CONVERSATION_ID } },
    ]);
    mockPrisma.message.findMany.mockResolvedValueOnce(rows);
    const viaUser = await service.getUnreadCountsForUser(USER_ID, [CONVERSATION_ID]);

    expect(viaParticipants.get(PARTICIPANT_ID)).toBe(1);
    expect(viaUser.get(CONVERSATION_ID)).toBe(1);
  });

  it('renvoie le MÊME compte quand le plancher est nul (jamais lu, pas de joinedAt)', async () => {
    const rows = candidateRows([
      { at: '2024-01-01T11:00:00Z', from: 'other' },
      { at: '2024-01-01T12:00:00Z', from: 'other' },
    ]);

    mockPrisma.conversationReadCursor.findMany.mockResolvedValueOnce([]);
    mockPrisma.message.findMany.mockResolvedValueOnce(rows);
    const viaParticipants = await service.getUnreadCountsForParticipants(
      [{ id: PARTICIPANT_ID, userId: USER_ID, joinedAt: null }],
      CONVERSATION_ID
    );

    mockPrisma.participant.findMany.mockResolvedValueOnce([participantRow({ joinedAt: null })]);
    mockPrisma.conversationReadCursor.findMany.mockResolvedValueOnce([]);
    mockPrisma.message.findMany.mockResolvedValueOnce(rows);
    const viaUser = await service.getUnreadCountsForUser(USER_ID, [CONVERSATION_ID]);

    expect(viaParticipants.get(PARTICIPANT_ID)).toBe(2);
    expect(viaUser.get(CONVERSATION_ID)).toBe(2);
  });

  it('les deux chemins passent par UN SEUL `message.findMany`, jamais par `message.count` (implémentation partagée)', async () => {
    mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.participant.findMany.mockResolvedValueOnce([participantRow()]);

    await service.getUnreadCountsForParticipants(
      [{ id: PARTICIPANT_ID, userId: USER_ID, joinedAt: new Date('2024-01-01T00:00:00Z') }],
      CONVERSATION_ID
    );
    await service.getUnreadCountsForUser(USER_ID, [CONVERSATION_ID]);

    expect(mockPrisma.message.count).not.toHaveBeenCalled();
    expect(mockPrisma.message.findMany).toHaveBeenCalledTimes(2);
  });
});

describe('unreadCountsCore — le calcul partagé, en isolation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('unreadFloorFor combine le plancher de lecture et le cutoff de masquage via Math.max', () => {
    const participant = { id: PARTICIPANT_ID, joinedAt: new Date('2024-01-01T00:00:00Z') };

    // Cutoff (11:30) postérieur au plancher de lecture (10:00) → le cutoff gagne.
    const withLaterCutoff = unreadFloorFor(
      participant,
      new Date('2024-01-01T10:00:00Z'),
      { clearHistoryBefore: new Date('2024-01-01T11:30:00Z'), hiddenMessageIds: [] }
    );
    expect(withLaterCutoff.floorMs).toBe(new Date('2024-01-01T11:30:00Z').getTime() - 1);

    // Plancher de lecture (15:00) postérieur au cutoff (11:30) → le plancher gagne.
    const withLaterRead = unreadFloorFor(
      participant,
      new Date('2024-01-01T15:00:00Z'),
      { clearHistoryBefore: new Date('2024-01-01T11:30:00Z'), hiddenMessageIds: [] }
    );
    expect(withLaterRead.floorMs).toBe(new Date('2024-01-01T15:00:00Z').getTime());

    // Rien de masqué, jamais lu, pas de joinedAt → plancher nul.
    const unbounded = unreadFloorFor({ id: 'p2', joinedAt: null }, null, NO_PERSONAL_HIDING);
    expect(unbounded.floorMs).toBeNull();
  });

  it('computeUnreadCounts compte au-dessus du plancher, exclut le message propre, une seule requête pour plusieurs floors', async () => {
    mockPrisma.message.findMany.mockResolvedValueOnce([
      { createdAt: new Date('2024-01-01T11:00:00Z'), senderId: 'other' },
      { createdAt: new Date('2024-01-01T12:00:00Z'), senderId: PARTICIPANT_ID },
    ]);

    const result = await computeUnreadCounts(mockPrisma, CONVERSATION_ID, [
      { id: PARTICIPANT_ID, floorMs: new Date('2024-01-01T10:00:00Z').getTime(), hiddenMessageIds: null },
    ]);

    expect(result.get(PARTICIPANT_ID)).toBe(1); // le message d'`other` seul — le sien est exclu
    expect(mockPrisma.message.findMany).toHaveBeenCalledTimes(1);
  });

  it('computeUnreadCounts renvoie une carte à zéro (une entrée par floor) quand la base échoue', async () => {
    mockPrisma.message.findMany.mockRejectedValueOnce(new Error('DB down'));

    const result = await computeUnreadCounts(mockPrisma, CONVERSATION_ID, [
      { id: 'p1', floorMs: null, hiddenMessageIds: null },
      { id: 'p2', floorMs: null, hiddenMessageIds: null },
    ]);

    expect(result.get('p1')).toBe(0);
    expect(result.get('p2')).toBe(0);
  });
});

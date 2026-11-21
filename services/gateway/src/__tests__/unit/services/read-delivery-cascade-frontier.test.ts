/**
 * La cascade « lu ⇒ remis » au niveau du SERVICE : l'invariant, et la frontière
 * du curseur de livraison (#20105).
 *
 * ─── Pourquoi un fichier à part ─────────────────────────────────────────────
 *
 * Ces deux témoins vivaient dans `MessageReadStatusService.test.ts`, qui est à
 * 5 077 lignes — quatre fois le plafond de 1 200, et gelé par
 * `gateway-test-file-size-budget`. La directive interdit d'AJOUTER à un fichier
 * hors budget : on extrait d'abord. Le premier remplace un témoin de ce
 * fichier-là, dont l'assertion gardait la cascade NON BORNÉE.
 *
 * ─── Ce qu'ils gardent, et la division du travail avec le témoin de ROUTE ───
 *
 * `read-cascade-bounded-to-what-it-reads.test.ts` mesure l'EFFET à travers la
 * porte REST (quels messages reçoivent un `deliveredAt`). Ces deux-ci mesurent
 * le cas que la route ne sait pas construire : un participant SANS aucun
 * `ConversationReadCursor` — hors ligne à l'arrivée des messages — chez qui le
 * curseur de lecture ne bouge pas. C'est le scénario pour lequel l'ancien
 * témoin existait, et il reste le bon.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { MessageReadStatusService } from '../../../services/MessageReadStatusService';

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    markConversationNotificationsAsRead: jest.fn().mockResolvedValue(0),
  })),
}));

const PARTICIPANT = '507f1f77bcf86cd799439011';
const CONVERSATION = '507f1f77bcf86cd799439012';
const MSG_A = '507f1f77bcf86cd799439021';
const MSG_B = '507f1f77bcf86cd799439022';

type Prefixes = {
  /** Les messages de la conversation, du plus ancien au plus récent. */
  readonly ordre: readonly string[];
  /** Ceux dont une entrée figée prouve la LECTURE. */
  readonly lus: readonly string[];
  /** Ceux dont une entrée figée prouve la LIVRAISON. */
  readonly remis: readonly string[];
};

let mockPrisma: any;
let service: MessageReadStatusService;

/**
 * Doubles câblés sur la FORME du `where`, jamais sur l'ORDRE des appels.
 *
 * Le gel de livraison démarre les décomptes éphémères (#7451), qui interrogent
 * `message.findMany` et `messageStatusEntry.findMany` à leur tour. Une file
 * `mockResolvedValueOnce` se décale donc d'un appel que le lot ne nomme pas, et
 * un témoin qui draine sa file passe au vert sur la valeur par DÉFAUT —
 * c'est-à-dire sans rien prouver. C'est le défaut qu'a eu la première écriture
 * de ces deux témoins.
 */
function cablerPrefixes(prefixes: Prefixes): void {
  mockPrisma.message.findMany.mockImplementation(async (q: any) => {
    const where = q?.where ?? {};
    // La sonde des éphémères — elle NOMME `ephemeralDuration` dans son `AND`.
    if (Array.isArray(where.AND)) return [];
    // Un gel : la liste EST la borne.
    if (where.id?.in) return where.id.in.map((id: string) => ({ id }));
    // Un balayage de préfixe contigu : trié du plus ancien, borné par `take`.
    if (q?.orderBy?.createdAt === 'asc') return prefixes.ordre.map((id) => ({ id }));
    return [];
  });
  mockPrisma.messageStatusEntry.findMany.mockImplementation(async (q: any) => {
    const where = q?.where ?? {};
    if (where.readAt?.not === null) return prefixes.lus.map((messageId) => ({ messageId }));
    if (where.deliveredAt?.not === null) return prefixes.remis.map((messageId) => ({ messageId }));
    // La relecture write-once du gel : rien de figé.
    return [];
  });
}

const deliveredFreeze = () =>
  mockPrisma.messageStatusEntry.createMany.mock.calls.find(
    (call: any) => Array.isArray(call[0]?.data) && call[0].data.some((row: any) => row.deliveredAt)
  );

const cursorWriteNaming = (field: 'lastReadMessageId' | 'lastDeliveredMessageId') => [
  ...mockPrisma.conversationReadCursor.updateMany.mock.calls,
  ...mockPrisma.conversationReadCursor.create.mock.calls,
].filter((call: any) => call[0]?.data?.[field] !== undefined);

beforeEach(() => {
  mockPrisma = {
    conversationReadCursor: {
      // Aucun curseur : le participant était hors ligne à l'arrivée des messages.
      findUnique: jest.fn(async () => null),
      // L'avance gardée ne matche donc rien, et `_advanceCursor` crée la ligne.
      updateMany: jest.fn(async () => ({ count: 0 })),
      create: jest.fn(async () => ({})),
      findMany: jest.fn(async () => []),
      upsert: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    messageStatusEntry: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      createMany: jest.fn(async (args: any) => ({ count: (args?.data ?? []).length })),
      updateMany: jest.fn(async () => ({ count: 0 })),
      count: jest.fn(async () => 0),
    },
    message: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => ({ id: MSG_B })),
      findUnique: jest.fn(async (args: any) => ({
        id: args?.where?.id,
        conversationId: CONVERSATION,
        createdAt: new Date('2026-11-20T10:00:00Z'),
      })),
      updateMany: jest.fn(async () => ({ count: 0 })),
      count: jest.fn(async () => 0),
    },
    participant: {
      findUnique: jest.fn(async () => ({ id: PARTICIPANT, userId: 'user-1' })),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    userPreferences: { findMany: jest.fn(async () => []) },
    userConversationPreferences: { findFirst: jest.fn(async () => null) },
  };
  service = new MessageReadStatusService(mockPrisma);
});

describe('la cascade « lu ⇒ remis » chez un participant sans curseur (#20105)', () => {
  it("l'invariant tient par le GEL, et le curseur de livraison ne saute pas au bas du fil", async () => {
    // msgA n'a jamais été affiché ni remis ; le lecteur ne rapporte que msgB.
    //
    // L'ancien témoin de ce scénario exigeait que le curseur de LIVRAISON soit
    // créé sur msgB, « sinon msgB porte un readAt figé sans deliveredAt ». Il
    // l'était — parce que la cascade partait du BAS DU FIL sans borne, la même
    // ligne gravant `deliveredAt` sur tout message depuis le curseur précédent.
    //
    // L'invariant qu'il NOMME est désormais porté par le GEL, qui part le
    // PREMIER et sans dépendre du verdict du curseur : strictement plus fort.
    // Le curseur n'indexe plus que ce qu'une entrée figée PROUVE remis
    // (#18731) — msgA ne l'étant pas, il ne bouge pas, et c'est le verdict
    // juste : une réponse plus PAUVRE (les entrées figées répondent seules),
    // jamais une réponse FAUSSE.
    cablerPrefixes({ ordre: [MSG_A, MSG_B], lus: [MSG_B], remis: [MSG_B] });

    await service.markMessagesAsRead(PARTICIPANT, CONVERSATION, MSG_B, { messageIds: [MSG_B] });

    // Le curseur de LECTURE ne bouge pas : msgA reste non lu.
    expect(cursorWriteNaming('lastReadMessageId')).toEqual([]);

    // msgB est figé remis — donc aucun `readAt` ne vit sans son `deliveredAt`.
    expect(deliveredFreeze()).toBeDefined();
    expect(deliveredFreeze()![0].data.map((row: any) => row.messageId)).toEqual([MSG_B]);

    // Et la frontière de livraison ne franchit pas msgA.
    expect(cursorWriteNaming('lastDeliveredMessageId')).toEqual([]);
  });

  it('le curseur de livraison avance dès que le préfixe est ENTIÈREMENT prouvé remis', async () => {
    // La moitié POSITIVE du témoin ci-dessus, et c'est elle qui interdit de le
    // satisfaire en ne faisant jamais rien — un témoin qu'une production inerte
    // contente n'atteste rien.
    cablerPrefixes({ ordre: [MSG_A, MSG_B], lus: [MSG_B], remis: [MSG_A, MSG_B] });

    await service.markMessagesAsRead(PARTICIPANT, CONVERSATION, MSG_B, { messageIds: [MSG_B] });

    expect(mockPrisma.conversationReadCursor.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastDeliveredMessageId: MSG_B }),
      })
    );
  });
});

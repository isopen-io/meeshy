/**
 * `broadcastReadStatus` — ce que l'émetteur dit quand il n'a RIEN calculé
 * (cycle 63 bis).
 *
 * Complément de `socketio/__tests__/broadcastReadStatus.test.ts`, qui garde le
 * chemin NOMINAL : depuis le cycle 63, cette resynchro CALCULE le pont ✦ quand
 * la lecture est partielle, pour quatre requêtes payées seulement dans ce cas.
 *
 * Restent deux replis où rien n'est calculé — un appelant qui ne fournit aucun
 * constructeur de pont (le cas de ce fichier), et une passe qui tombe. Les deux
 * clients recopiant `bridge` INCONDITIONNELLEMENT
 * (`ConversationSyncEngine.handleUnreadUpdated` côté iOS,
 * `setConversationUnreadInCache` côté web), ces replis ORDONNAIENT l'effacement
 * du pont en cache alors qu'ils n'avaient rien à en dire.
 *
 * Ce que ces témoins gardent, c'est la frontière entre les deux phrases, sur un
 * appelant SANS constructeur :
 *   - compteur > 0  ⇒ clé ABSENTE  (« je n'ai pas calculé ») ⇒ le client garde ;
 *   - compteur == 0 ⇒ `bridge: null` (« il n'y en a plus », §3.2) ⇒ il efface.
 *
 * La seconde est gratuite, et vraie même sans constructeur : elle ne coûte
 * aucune requête, et c'est elle qui nettoie les autres appareils quand on finit
 * de lire sur celui-ci.
 */

import { jest } from '@jest/globals';
import { broadcastReadStatus } from '../../../socketio/broadcastReadStatus';
import { makeChainableIO } from '../../helpers/chainable-io';

const CONV_ID = '507f1f77bcf86cd799439011';
const PART_ID = '507f1f77bcf86cd799439022';
const USER_ID = '507f1f77bcf86cd799439033';

type EmittedPayload = { conversationId: string; unreadCount: number; bridge?: unknown };

function harness(options: { unreadCount: number; showReadReceipts?: boolean }) {
  // La forme de production CHAÎNE (`io.to(a).to(b).except(c).emit(...)`) : un
  // double qui casse dessus décrirait un autre programme que celui qu'on livre.
  const io = makeChainableIO();

  const prisma = {
    conversationReadCursor: {
      findUnique: jest.fn<any>().mockResolvedValue({ lastReadAt: new Date('2026-08-17T10:00:00Z') }),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([{ id: PART_ID, userId: USER_ID }]),
    },
  };

  const readStatusService = {
    getLatestMessageSummary: jest.fn<any>().mockResolvedValue({
      messageId: 'msg-1',
      conversationId: CONV_ID,
      readCount: 1,
      deliveredCount: 1,
      totalMembers: 2,
      readBy: [],
      deliveredTo: [],
    }),
    getUnreadCount: jest.fn<any>().mockResolvedValue(options.unreadCount),
  };

  const privacyPreferencesService = {
    shouldShowReadReceipts: jest.fn<any>().mockResolvedValue(options.showReadReceipts ?? true),
  };

  return { io, prisma, readStatusService, privacyPreferencesService };
}

const unreadPayloads = (io: ReturnType<typeof makeChainableIO>): EmittedPayload[] =>
  io._sendsFor('conversation:unread-updated').map((send) => send.payload as EmittedPayload);

describe('broadcastReadStatus — « je n\'ai pas calculé le pont » n\'est pas « il n\'y a pas de pont »', () => {
  it('ne dit RIEN du pont sans constructeur, quand la lecture était partielle', async () => {
    const { io, prisma, readStatusService, privacyPreferencesService } = harness({
      unreadCount: 3,
    });

    await broadcastReadStatus(
      { io: io as any, prisma: prisma as any, readStatusService, privacyPreferencesService },
      { conversationId: CONV_ID, participantId: PART_ID, userId: USER_ID, isAnonymous: false, type: 'read' }
    );

    const payloads = unreadPayloads(io);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toEqual({ conversationId: CONV_ID, unreadCount: 3 });
    expect(payloads[0]).not.toHaveProperty('bridge');
  });

  it('annonce `bridge: null` quand le compteur retombe à zéro — la seule chose qu\'un compteur prouve', async () => {
    const { io, prisma, readStatusService, privacyPreferencesService } = harness({
      unreadCount: 0,
    });

    await broadcastReadStatus(
      { io: io as any, prisma: prisma as any, readStatusService, privacyPreferencesService },
      { conversationId: CONV_ID, participantId: PART_ID, userId: USER_ID, isAnonymous: false, type: 'read' }
    );

    expect(unreadPayloads(io)[0]).toEqual({
      conversationId: CONV_ID,
      unreadCount: 0,
      bridge: null,
    });
  });

  // La préférence décide de la DIFFUSION de l'accusé, jamais de la resynchro du
  // badge de l'acteur : les deux branches passent par le même émetteur, donc la
  // règle du pont ne peut pas diverger entre elles.
  it('tient la même règle sur la branche « accusés masqués »', async () => {
    const { io, prisma, readStatusService, privacyPreferencesService } = harness({
      unreadCount: 2,
      showReadReceipts: false,
    });

    await broadcastReadStatus(
      { io: io as any, prisma: prisma as any, readStatusService, privacyPreferencesService },
      { conversationId: CONV_ID, participantId: PART_ID, userId: USER_ID, isAnonymous: false, type: 'read' }
    );

    const payloads = unreadPayloads(io);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).not.toHaveProperty('bridge');
  });

  // Un `received` n'avance aucun curseur : il n'y a pas de compteur recalculé,
  // donc aucun `conversation:unread-updated` — et donc rien à dire du pont.
  it('n\'émet aucun compteur — donc aucune phrase sur le pont — pour un `received`', async () => {
    const { io, prisma, readStatusService, privacyPreferencesService } = harness({
      unreadCount: 4,
    });

    await broadcastReadStatus(
      { io: io as any, prisma: prisma as any, readStatusService, privacyPreferencesService },
      { conversationId: CONV_ID, participantId: PART_ID, userId: USER_ID, isAnonymous: false, type: 'received' }
    );

    expect(unreadPayloads(io)).toHaveLength(0);
  });
});

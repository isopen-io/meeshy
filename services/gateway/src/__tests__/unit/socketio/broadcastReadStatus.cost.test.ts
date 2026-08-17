/**
 * Ce que le pont ✦ COÛTE sur l'accusé de lecture — cycle 63, jumeau du témoin
 * de coût du fan-out d'envoi (`emitUnreadCountsToRecipients.cost.test.ts`).
 *
 * Le carnet du cycle 62 avait consigné ce site comme un arbitrage : attacher le
 * pont ici « coûterait les 5 requêtes de la passe à CHAQUE accusé de lecture,
 * sur l'un des chemins les plus chauds du service ». La phrase pose le prix
 * comme un fait ; ce fichier le MESURE, et la mesure dit autre chose.
 *
 * Deux propriétés, et il faut les deux — l'une sans l'autre ne prouve rien :
 *
 *   1. **Le cas dominant est GRATUIT.** Lire une conversation la vide : le
 *      compteur retombe à 0, le contrat gelé §3.2 dit qu'un compteur nul n'a
 *      pas de pont, et la passe n'est pas appelée. Zéro requête ajoutée sur
 *      l'écrasante majorité des accusés de lecture — la même garde que les
 *      deux émetteurs frères portent déjà.
 *
 *   2. **La lecture PARTIELLE — la seule qui paie — paie QUATRE requêtes, pas
 *      cinq.** Le curseur que la passe irait relire est celui que
 *      `broadcastReadStatus` vient de lire pour calculer le compteur qu'elle
 *      émet ; il lui est passé (`cursorsByParticipant`). Un témoin qui
 *      compterait 5 dirait que l'économie a disparu.
 *
 * Comme son jumeau, ce témoin tourne contre les VRAIS services
 * (`MessageReadStatusService`, `ConversationBridgeService`) sur un double
 * Prisma qui compte ses appels : un double de pont-jouet ne prouverait rien du
 * coût. Et comme lui, il vérifie AUSSI que le travail a été fait — un service
 * qui n'attache plus aucun pont satisferait sinon tous les compteurs.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import { broadcastReadStatus } from '../../../socketio/broadcastReadStatus';
import { ConversationBridgeService } from '../../../services/ConversationBridgeService';
import { MessageReadStatusService } from '../../../services/MessageReadStatusService';

const CONV_ID = '507f1f77bcf86cd799439022';
const READER_PART_ID = '507f1f77bcf86cd799439031';
const READER_USER_ID = '507f1f77bcf86cd799439032';
const PEER_PART_ID = '507f1f77bcf86cd799439041';

const at = (iso: string) => new Date(iso);
const JOINED_AT = at('2026-01-01T00:00:00.000Z');
/** Le curseur s'est arrêté au milieu : deux messages restent derrière lui. */
const CURSOR_AT = at('2026-03-01T10:30:00.000Z');

type MessageRow = { id: string; senderId: string; createdAt: Date };

function makeCountingPrisma(messages: MessageRow[], cursorAt: Date | null) {
  const counters: Record<string, number> = {};
  const count = (key: string) => {
    counters[key] = (counters[key] ?? 0) + 1;
  };

  const cursorRow =
    cursorAt === null
      ? null
      : { participantId: READER_PART_ID, lastReadAt: cursorAt, lastReadMessageCreatedAt: cursorAt };

  const matchesFloor = (value: Date, bound: any): boolean =>
    !bound?.gt || value.getTime() > (bound.gt as Date).getTime();

  const readerParticipant = {
    id: READER_PART_ID,
    userId: READER_USER_ID,
    conversationId: CONV_ID,
    joinedAt: JOINED_AT,
    isActive: true,
  };

  return {
    __counters: counters,
    get __total() {
      return Object.values(counters).reduce((a, b) => a + b, 0);
    },

    participant: {
      findMany: async ({ where }: any) => {
        count('participant.findMany');
        // Deux formes distinctes arrivent ici : l'éventail des pairs
        // (`{conversationId, isActive}`) et la résolution du lecteur par la
        // passe de pont (`OR: [{id}, {userId}]`). Le double les distingue,
        // sinon un service qui interroge la mauvaise colonne resterait vert.
        if (where.OR) {
          const ids = where.OR.flatMap((clause: any) => [clause.id, clause.userId].filter(Boolean));
          return ids.includes(READER_PART_ID) || ids.includes(READER_USER_ID)
            ? [readerParticipant]
            : [];
        }
        return [
          { id: READER_PART_ID, userId: READER_USER_ID },
          { id: PEER_PART_ID, userId: null },
        ];
      },
      findFirst: async () => {
        count('participant.findFirst');
        return readerParticipant;
      },
    },

    conversationReadCursor: {
      findUnique: async () => {
        count('conversationReadCursor.findUnique');
        return cursorRow;
      },
      findMany: async () => {
        count('conversationReadCursor.findMany');
        return cursorRow ? [cursorRow] : [];
      },
    },

    userConversationPreferences: {
      findMany: async () => {
        count('userConversationPreferences.findMany');
        return [];
      },
      findFirst: async () => {
        count('userConversationPreferences.findFirst');
        return null;
      },
    },
    userMessageDeletion: {
      findMany: async () => {
        count('userMessageDeletion.findMany');
        return [];
      },
    },

    message: {
      count: async ({ where }: any) => {
        count('message.count');
        return messages.filter(
          (m) => m.senderId !== READER_PART_ID && matchesFloor(m.createdAt, where.createdAt)
        ).length;
      },
      findMany: async ({ where, take }: any) => {
        count('message.findMany');
        const clause = where.OR ? where.OR[0] : where;
        const matched = messages
          .filter((m) => m.senderId !== READER_PART_ID && matchesFloor(m.createdAt, clause.createdAt))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        return (typeof take === 'number' ? matched.slice(0, take) : matched).map((m) => ({
          id: m.id,
          conversationId: CONV_ID,
          senderId: m.senderId,
          createdAt: m.createdAt,
          messageType: 'text',
          sender: { displayName: 'Alice', nickname: null, user: null },
          attachments: [],
        }));
      },
    },
  } as any;
}

/** Trois messages du pair ; le curseur en laisse deux derrière lui. */
const THREE_PEER_MESSAGES: MessageRow[] = [
  { id: 'm1', senderId: PEER_PART_ID, createdAt: at('2026-03-01T10:00:00.000Z') },
  { id: 'm2', senderId: PEER_PART_ID, createdAt: at('2026-03-01T11:00:00.000Z') },
  { id: 'm3', senderId: PEER_PART_ID, createdAt: at('2026-03-01T12:00:00.000Z') },
];

async function broadcastWith(options: {
  messages: MessageRow[];
  cursorAt: Date | null;
  withBridge?: boolean;
}) {
  const prisma = makeCountingPrisma(options.messages, options.cursorAt);
  const emitted: Array<{ room: string; event: string; payload: any }> = [];
  const chain = (room: string): any => ({
    to: () => chain(room),
    except: () => chain(room),
    emit: (event: string, payload: unknown) => emitted.push({ room, event, payload }),
  });

  // `getUnreadCount` et la passe de pont sont les VRAIS services — ce sont eux
  // que ce témoin mesure. `getLatestMessageSummary` est neutralisé : il paie un
  // coût FIXE, identique des deux côtés de la comparaison, et le laisser réel
  // ferait entrer dans le compteur le cache de préférences de confidentialité
  // (`loadPrivacyPreferencesCached`) — dont la mémoire persiste ENTRE les deux
  // exécutions comparées, ce qui rendrait la mesure dépendante de l'ordre des
  // témoins.
  const readStatusService = new MessageReadStatusService(prisma);
  (readStatusService as any).getLatestMessageSummary = async () => ({
    totalMembers: 1,
    deliveredCount: 0,
    readCount: 0,
  });

  await broadcastReadStatus(
    {
      io: { to: (room: string) => chain(room) } as any,
      prisma,
      readStatusService,
      privacyPreferencesService: { shouldShowReadReceipts: async () => true },
      ...(options.withBridge === false
        ? {}
        : { bridgeService: new ConversationBridgeService(prisma) }),
    },
    {
      conversationId: CONV_ID,
      participantId: READER_PART_ID,
      userId: READER_USER_ID,
      isAnonymous: false,
      type: 'read',
    }
  );

  const badge = emitted.find((e) => e.event === 'conversation:unread-updated');
  return { prisma, badge };
}

describe('broadcastReadStatus — le coût Prisma du pont sur l\'accusé de lecture', () => {
  it('ne paie AUCUNE requête de pont quand la lecture a tout consommé', async () => {
    // Curseur au-delà du dernier message ⇒ compteur 0 ⇒ le cas dominant.
    const after = await broadcastWith({
      messages: THREE_PEER_MESSAGES,
      cursorAt: at('2026-03-02T00:00:00.000Z'),
    });
    const without = await broadcastWith({
      messages: THREE_PEER_MESSAGES,
      cursorAt: at('2026-03-02T00:00:00.000Z'),
      withBridge: false,
    });

    expect(after.badge!.payload).toEqual({ conversationId: CONV_ID, unreadCount: 0 });
    // La comparaison est le témoin : le même chemin, avec et sans constructeur
    // de pont, coûte EXACTEMENT la même chose.
    expect(after.prisma.__total).toBe(without.prisma.__total);
    expect(after.prisma.__counters).toEqual(without.prisma.__counters);

    // Mesuré, et à consigner tel quel : cette gratuité tient par DEUX gardes
    // indépendantes — celle du site d'appel (`unreadCount <= 0`) et le premier
    // étage de `buildBridgeData` (contrat gelé §3.2), qui écarte un candidat à
    // zéro avant toute requête. Retirer la première ne fait donc PAS tomber ce
    // témoin ; c'est `broadcastReadStatus.test.ts` (« does not call the bridge
    // pass AT ALL… ») qui la garde. Les deux témoins sont complémentaires : ici
    // le PRIX, là l'INTENTION.
  });

  it('paie QUATRE requêtes — pas cinq — quand la lecture est partielle', async () => {
    const withBridge = await broadcastWith({ messages: THREE_PEER_MESSAGES, cursorAt: CURSOR_AT });
    const withoutBridge = await broadcastWith({
      messages: THREE_PEER_MESSAGES,
      cursorAt: CURSOR_AT,
      withBridge: false,
    });

    // Le travail a bien été fait : le badge annonce l'arriéré RÉEL et porte le
    // pont qui dit lesquels.
    expect(withBridge.badge!.payload.unreadCount).toBe(2);
    expect(withBridge.badge!.payload.bridge).toMatchObject({
      kind: 'fallback',
      unreadCount: 2,
      data: { authors: ['Alice'], extraAuthorCount: 0, messageCount: 2 },
    });
    expect(withoutBridge.badge!.payload.bridge).toBeUndefined();

    // 5 − 1 : la passe ne relit pas le curseur, il lui est passé. Ce chiffre
    // EST l'arbitrage du cycle 63 ; s'il repasse à 5, l'économie a disparu.
    expect(withBridge.prisma.__total - withoutBridge.prisma.__total).toBe(4);

    // Et la requête épargnée est NOMMÉE, pas seulement soustraite : un total à
    // 4 obtenu en relisant le curseur et en économisant ailleurs décrirait un
    // autre programme.
    const cursorBatches = (run: typeof withBridge) =>
      run.prisma.__counters['conversationReadCursor.findMany'] ?? 0;
    expect(cursorBatches(withBridge)).toBe(cursorBatches(withoutBridge));
  });

  it('paie ces quatre requêtes UNE fois, jamais une passe par message non lu', async () => {
    const few = await broadcastWith({ messages: THREE_PEER_MESSAGES, cursorAt: CURSOR_AT });
    const many = await broadcastWith({
      messages: Array.from({ length: 40 }, (_, i) => ({
        id: `m${i}`,
        senderId: PEER_PART_ID,
        createdAt: at(`2026-03-02T${String(i % 24).padStart(2, '0')}:00:00.000Z`),
      })),
      cursorAt: CURSOR_AT,
    });

    expect(many.badge!.payload.unreadCount).toBe(40);
    expect(many.prisma.__total).toBe(few.prisma.__total);
  });
});

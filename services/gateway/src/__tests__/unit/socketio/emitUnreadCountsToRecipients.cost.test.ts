/**
 * Ce que le fan-out de pastilles COÛTE — le témoin de compteurs du chemin
 * socket chaud (REV-5/B2), jumeau de celui de G-122
 * (`ConversationBridgeService.test.ts`, « non-N+1, contrainte dure 1 »).
 *
 * `emitUnreadCountsToRecipients` est INLINE dans l'envoi d'un message : les
 * deux `broadcastNewMessage` l'attendent avant de rendre la main. Son coût est
 * donc payé par chaque message écrit sur la plateforme — et il est le seul de
 * ce fichier qu'aucune suite ne regardait. Les 18 tests de comportement
 * (`emitUnreadCountsToRecipients.test.ts`) prouvent QUE le pont s'attache ;
 * celui-ci prouve à QUEL PRIX.
 *
 * Le défaut mesuré par REV-5 : le pont était demandé par
 * `buildBridgeData({ candidates: [UNE conversation] })`, UNE FOIS PAR
 * DESTINATAIRE. La passe du service coûte un nombre constant de requêtes
 * (5) ; l'appeler par destinataire les payait donc N fois. Compteurs réels
 * relevés sur ce même témoin, avant correctif : **10 requêtes pour 1
 * destinataire, 55 pour 10** — 5 par destinataire, linéaire.
 *
 * Ce que ce témoin compte est le chemin RÉEL : `MessageReadStatusService` et
 * `ConversationBridgeService` sont les vrais services, sur un double Prisma
 * qui compte ses appels. Un double de pont-jouet ne prouverait rien du coût.
 *
 * Un témoin qui ne compterait que les requêtes serait satisfait par un
 * service qui n'attache aucun pont : chaque cas vérifie donc AUSSI que les
 * destinataires reçoivent bien leur pont.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import { emitUnreadCountsToRecipients } from '../../../socketio/emitUnreadCountsToRecipients';
import { ConversationBridgeService } from '../../../services/ConversationBridgeService';
import { MessageReadStatusService } from '../../../services/MessageReadStatusService';

const CONV_ID = '507f1f77bcf86cd799439022';
const SENDER_PART_ID = '507f1f77bcf86cd799439031';

const at = (iso: string) => new Date(iso);
const CURSOR_AT = at('2026-02-01T00:00:00.000Z');
const JOINED_AT = at('2026-01-01T00:00:00.000Z');

type ParticipantRow = { id: string; userId: string | null; joinedAt: Date | null; isActive: boolean };
type MessageRow = { id: string; senderId: string; createdAt: Date; deletedAt: Date | null };

/**
 * Double Prisma COMPTEUR — même posture que celui de G-122 : il évalue
 * réellement ce qu'on lui demande (bornes `createdAt`, `isActive`, `OR`
 * d'identités), pour qu'un service qui filtre mal se voie, et il compte
 * chaque appel par nom de table.
 */
function makeCountingPrisma(participants: ParticipantRow[], messages: MessageRow[]) {
  const counters: Record<string, number> = {};
  const count = (key: string) => {
    counters[key] = (counters[key] ?? 0) + 1;
  };

  const matchesDateBound = (value: Date, bound: any): boolean => {
    if (!bound) return true;
    if (bound.gt instanceof Date && !(value.getTime() > bound.gt.getTime())) return false;
    if (bound.gte instanceof Date && !(value.getTime() >= bound.gte.getTime())) return false;
    return true;
  };

  return {
    __counters: counters,
    get __total() {
      return Object.values(counters).reduce((a, b) => a + b, 0);
    },

    participant: {
      findMany: async ({ where }: any) => {
        count('participant.findMany');
        const orIds: string[] = (where.OR ?? []).flatMap((clause: any) => [
          ...(clause.id?.in ?? []),
          ...(clause.userId?.in ?? []),
        ]);
        return participants
          .filter((p) => (where.isActive === true ? p.isActive : true))
          .filter((p) => orIds.length === 0 || orIds.includes(p.id) || (p.userId ? orIds.includes(p.userId) : false))
          .map((p) => ({ ...p, conversationId: CONV_ID }));
      },
    },

    conversationReadCursor: {
      findMany: async ({ where }: any) => {
        count('conversationReadCursor.findMany');
        const ids: string[] = where.participantId?.in ?? [];
        return participants
          .filter((p) => ids.includes(p.id))
          .map((p) => ({
            participantId: p.id,
            lastReadAt: CURSOR_AT,
            lastReadMessageCreatedAt: CURSOR_AT,
          }));
      },
    },

    // Personne ne masque rien ici : le témoin mesure le coût du cas NOMINAL,
    // celui que chaque message paie. Les deux requêtes restent comptées —
    // c'est bien deux allers-retours, résultat vide ou non.
    userConversationPreferences: {
      findMany: async () => {
        count('userConversationPreferences.findMany');
        return [];
      },
    },
    userMessageDeletion: {
      findMany: async () => {
        count('userMessageDeletion.findMany');
        return [];
      },
    },

    message: {
      findMany: async ({ where, take }: any) => {
        count('message.findMany');
        const matched = messages
          .filter((m) => (where.deletedAt === null ? m.deletedAt === null : true))
          .filter((m) => matchesDateBound(m.createdAt, where.createdAt))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        const limited = typeof take === 'number' ? matched.slice(0, take) : matched;
        return limited.map((m) => ({
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

/** Une conversation à `recipientCount` destinataires, chacun 3 non-lus. */
function makeFixture(recipientCount: number) {
  const participants: ParticipantRow[] = [
    { id: SENDER_PART_ID, userId: 'u-sender', joinedAt: JOINED_AT, isActive: true },
  ];
  for (let i = 0; i < recipientCount; i++) {
    participants.push({ id: `p-${i}`, userId: `u-${i}`, joinedAt: JOINED_AT, isActive: true });
  }
  const messages: MessageRow[] = [
    { id: 'm1', senderId: SENDER_PART_ID, createdAt: at('2026-03-01T10:00:00.000Z'), deletedAt: null },
    { id: 'm2', senderId: SENDER_PART_ID, createdAt: at('2026-03-01T11:00:00.000Z'), deletedAt: null },
    { id: 'm3', senderId: SENDER_PART_ID, createdAt: at('2026-03-01T12:00:00.000Z'), deletedAt: null },
  ];
  return { participants, messages };
}

async function fanOutTo(recipientCount: number) {
  const { participants, messages } = makeFixture(recipientCount);
  const prisma = makeCountingPrisma(participants, messages);

  const emitted: Array<{ room: string; payload: any }> = [];
  const io = {
    to: (room: string) => ({
      emit: (_event: string, payload: unknown) => {
        emitted.push({ room, payload });
      },
    }),
  };

  await emitUnreadCountsToRecipients({
    io,
    prisma,
    readStatusService: new MessageReadStatusService(prisma),
    bridgeService: new ConversationBridgeService(prisma),
    conversationId: CONV_ID,
    senderId: SENDER_PART_ID,
    onError: (error) => {
      throw error;
    },
  });

  return { prisma, emitted };
}

describe('emitUnreadCountsToRecipients — le coût Prisma du chemin chaud (REV-5/B2)', () => {
  it('coûte le MÊME nombre de requêtes pour 1 destinataire et pour 10', async () => {
    const one = await fanOutTo(1);
    const ten = await fanOutTo(10);

    // …et les deux ont bien fait le travail : chaque destinataire a reçu sa
    // pastille ET son pont. Sans cette vérification, un service qui n'attache
    // plus rien satisferait le compteur.
    expect(one.emitted).toHaveLength(1);
    expect(ten.emitted).toHaveLength(10);
    for (const { payload } of [...one.emitted, ...ten.emitted]) {
      expect(payload.unreadCount).toBe(3);
      expect(payload.bridge).toMatchObject({
        kind: 'fallback',
        unreadCount: 3,
        data: { authors: ['Alice'], extraAuthorCount: 0, messageCount: 3 },
      });
    }

    // Le cœur du témoin : aucune croissance avec le nombre de destinataires,
    // ni au total ni sur AUCUNE table prise séparément.
    expect(ten.prisma.__total).toBe(one.prisma.__total);
    expect(ten.prisma.__counters).toEqual(one.prisma.__counters);

    // Chiffres nus, pour que la régression se lise sans arithmétique :
    // 1 (participants du fan-out) + 4 (compteurs batchés) + 5 (ponts batchés).
    // Avant correctif, ce même témoin relevait 10 et 55.
    expect(one.prisma.__total).toBe(10);
    expect(ten.prisma.__total).toBe(10);
  });

  it('demande les ponts de 10 destinataires en UNE fenêtre de messages', async () => {
    const { prisma } = await fanOutTo(10);

    // 1 fenêtre pour les compteurs (`getUnreadCountsForParticipants`) + 1 pour
    // les ponts. Une par destinataire vaudrait 11.
    expect(prisma.__counters['message.findMany']).toBe(2);
    expect(prisma.__counters['participant.findMany']).toBe(2);
    expect(prisma.__counters['conversationReadCursor.findMany']).toBe(2);
  });

  // Borne absolue plutôt que relative : même si les deux passes changeaient
  // ensemble de coût, un fan-out qui repasse à « une passe par destinataire »
  // dépasserait cette poignée dès la troisième personne dans la conversation.
  it('reste sous une poignée de requêtes pour une conversation de 50 personnes', async () => {
    const { prisma, emitted } = await fanOutTo(49);

    expect(emitted).toHaveLength(49);
    expect(prisma.__total).toBeLessThanOrEqual(12);
  });

  // Le pont est un CONFORT ; la pastille est le produit. Un destinataire déjà
  // à jour n'a pas de pont à recevoir, et le lot vide n'appelle pas le
  // service du tout — les 5 requêtes de la passe ne sont pas payées.
  it('ne paie aucune requête de pont quand personne n\'a de non-lu', async () => {
    const { participants } = makeFixture(10);
    const prisma = makeCountingPrisma(participants, []); // aucun message ⇒ 0 non-lu
    const emitted: any[] = [];

    await emitUnreadCountsToRecipients({
      io: { to: () => ({ emit: (_e: string, payload: unknown) => emitted.push(payload) }) },
      prisma,
      readStatusService: new MessageReadStatusService(prisma),
      bridgeService: new ConversationBridgeService(prisma),
      conversationId: CONV_ID,
      senderId: SENDER_PART_ID,
    });

    expect(emitted).toHaveLength(10);
    // `bridge: null` — annoncé, pas payé. Zéro non-lu ⇒ pas de pont est une
    // réponse que le contrat gelé (§3.2) donne SANS interroger la base : le
    // destinataire l'apprend et retire le sien, et les 5 requêtes de la passe
    // ne sont toujours pas dépensées, ce que la ligne suivante prouve.
    expect(emitted.every((payload) => payload.unreadCount === 0 && payload.bridge === null)).toBe(true);
    expect(prisma.__total).toBe(5);
  });
});

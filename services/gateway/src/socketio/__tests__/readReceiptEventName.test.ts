/**
 * Un accusé de lecture voyage sous UN SEUL nom — celui que les trois clients
 * écoutent.
 *
 * ── Ce que ces témoins gèlent, et pourquoi il a fallu les écrire ────────────
 *
 * Le 2026-07-05, `message:read-status-updated` a été ajouté à côté du nom
 * historique `read-status:updated` : même charge utile, mais correctement
 * namespacé (`entity:action-word` — le nom historique hyphène l'ENTITÉ, ce que
 * la convention interdit). Il devait être DUAL-ÉMIS « ~3 mois, le temps que les
 * clients migrent », la migration des clients étant explicitement renvoyée à un
 * suivi séparé (`tasks/socketio-events-cleanup.md` § 3).
 *
 * Six semaines plus tard, ce suivi n'avait pas eu lieu — et `git log -S` sur
 * `apps/web`, `packages/MeeshySDK/Sources` et `apps/android` montre que le
 * nouveau nom n'est JAMAIS apparu dans une source cliente, pas même une fois,
 * pas même retirée depuis. Aucun binaire livré ne peut donc l'écouter. Le
 * dual-émission ne préparait aucune migration : elle payait deux fois le
 * fan-out le plus fréquent de la messagerie — chaque remise, chaque lecture,
 * chaque rejeu de file hors ligne — pour un nom que personne n'a jamais lu.
 *
 * `emitToConversationParticipants` boucle sur `events` autour de la MÊME
 * chaîne de rooms (`for (const event of events) emitter.emit(event, payload)`) :
 * deux noms, c'est exactement deux fois les octets sur le fil et deux réveils
 * radio par socket destinataire.
 *
 * D'où l'invariant, et il porte sur le NOMBRE avant de porter sur le nom : un
 * témoin qui n'affirmerait que « `read-status:updated` est émis » resterait vert
 * sous un troisième alias ajouté demain, c'est-à-dire sous la régression même
 * qu'il prétend garder.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { broadcastReadStatus } from '../broadcastReadStatus';
import { makeChainableIO } from '../../__tests__/helpers/chainable-io';

const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const ACTOR_USER_ID = '507f1f77bcf86cd799439077';
const ACTOR_PARTICIPANT_ID = '507f1f77bcf86cd799439066';
const PEER_PARTICIPANT_ID = '507f1f77bcf86cd799439044';
const PEER_USER_ID = '507f1f77bcf86cd799439055';

/** Le nom que web, iOS et Android écoutent — le seul, vérifié source par source. */
const READ_STATUS_ON_THE_WIRE = 'read-status:updated';

/**
 * Toute émission dont le nom PARLE d'accusé de lecture, quel que soit le
 * namespace choisi. C'est ce filtre-là — et non l'égalité à un nom connu — qui
 * fait tomber le témoin sous l'ajout d'un alias.
 */
const readStatusSends = (io: ReturnType<typeof makeChainableIO>) =>
  io._sent.filter((s) => s.event.includes('read-status'));

function makeHarness(overrides: { unreadCount?: number } = {}) {
  const io = makeChainableIO();

  const deps = {
    io,
    prisma: {
      conversationReadCursor: {
        findUnique: jest.fn<any>().mockResolvedValue({
          lastReadAt: new Date('2026-08-17T10:00:00.000Z'),
          lastReadMessageCreatedAt: new Date('2026-08-17T09:59:00.000Z'),
        }),
      },
      participant: {
        findMany: jest.fn<any>().mockResolvedValue([
          { id: ACTOR_PARTICIPANT_ID, userId: ACTOR_USER_ID },
          { id: PEER_PARTICIPANT_ID, userId: PEER_USER_ID },
        ]),
      },
    } as any,
    readStatusService: {
      getLatestMessageSummary: jest.fn<any>().mockResolvedValue({ lastMessageId: 'm1' }),
      getUnreadCount: jest.fn<any>().mockResolvedValue(overrides.unreadCount ?? 0),
    },
    privacyPreferencesService: {
      shouldShowReadReceipts: jest.fn<any>().mockResolvedValue(true),
    },
    bridgeService: { buildBridgeData: jest.fn<any>().mockResolvedValue(new Map()) },
  };

  return { io, deps };
}

const readArgs = () => ({
  conversationId: CONVERSATION_ID,
  participantId: ACTOR_PARTICIPANT_ID,
  userId: ACTOR_USER_ID,
  isAnonymous: false,
  type: 'read' as const,
});

describe("l'accusé de lecture ne voyage que sous UN nom", () => {
  beforeEach(() => jest.clearAllMocks());

  it('met UNE seule copie sur le fil pour les pairs, et une seule pour l’acteur', async () => {
    const { io, deps } = makeHarness({ unreadCount: 3 });

    await broadcastReadStatus(deps as any, readArgs());

    // Deux audiences, deux charges utiles distinctes (la version de l'acteur
    // porte son arriéré personnel) — donc deux émissions attendues, et JAMAIS
    // quatre. Le dual-émission en produisait quatre : deux noms × deux
    // audiences, dont la moitié sans destinataire.
    expect(readStatusSends(io)).toHaveLength(2);
  });

  it('n’émet qu’une copie quand l’acteur n’a pas de version à lui', async () => {
    const { io, deps } = makeHarness({ unreadCount: 0 });

    await broadcastReadStatus(deps as any, { ...readArgs(), type: 'received' as const });

    // Sur un `received`, les deux charges utiles seraient identiques : l'acteur
    // reste DANS l'éventail et il n'y a qu'une audience — donc une émission.
    expect(readStatusSends(io)).toHaveLength(1);
  });

  it('choisit le nom que les clients écoutent réellement', async () => {
    const { io, deps } = makeHarness({ unreadCount: 3 });

    await broadcastReadStatus(deps as any, readArgs());

    expect(new Set(readStatusSends(io).map((s) => s.event))).toEqual(
      new Set([READ_STATUS_ON_THE_WIRE])
    );
  });

  it('le contrat partagé ne déclare qu’un nom d’accusé de lecture', () => {
    // La déclaration EST la porte d'entrée : tant qu'un second nom existe dans
    // `SERVER_EVENTS`, un émetteur peut le reprendre sans que rien ne rougisse.
    const declared = Object.values(SERVER_EVENTS).filter((name) =>
      String(name).includes('read-status')
    );
    expect(declared).toEqual([READ_STATUS_ON_THE_WIRE]);
  });
});

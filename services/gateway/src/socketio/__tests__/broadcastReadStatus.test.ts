/**
 * `broadcastReadStatus` — le pont ✦ sur la resynchro du LECTEUR (cycle 63).
 *
 * Ce fichier garde le QUATRIÈME et dernier émetteur de
 * `conversation:unread-updated`. Les trois autres ont été instruits avant lui :
 * le fan-out d'envoi (`emitUnreadCountsToRecipients`, G-123), l'instantané de
 * reconnexion (`_emitUnreadCountsSnapshot`, cycle 62), et `conversation:join`
 * — où l'effacement est légitime, puisqu'on rejoint une conversation pour la
 * lire.
 *
 * Celui-ci ne l'était pas. Les deux clients recopient `bridge`
 * INCONDITIONNELLEMENT, `undefined` / `nil` compris
 * (`ConversationSyncEngine.handleUnreadUpdated` ; côté web
 * `setConversationUnreadInCache(…, { bridge: data.bridge })`), donc la forme
 * courte n'est pas un silence : c'est un ORDRE D'EFFACEMENT. Or une lecture
 * PARTIELLE — le curseur n'avance que sur le préfixe contigu — laisse le
 * compteur au-dessus de zéro : l'événement annonçait « il te reste 3 messages »
 * en effaçant du même geste le repère qui dit lesquels, sur TOUS les appareils
 * du lecteur.
 *
 * ── Le prix, et pourquoi il n'est pas celui qu'on croyait ───────────────────
 * Le carnet du cycle 62 avait consigné ce site comme un arbitrage de coût :
 * « les 5 requêtes de la passe à CHAQUE accusé de lecture ». C'était surcompter.
 * Le gate à zéro non-lu — le même que les deux émetteurs frères portent déjà —
 * range le cas DOMINANT (lire une conversation la vide) du côté gratuit : zéro
 * requête, et l'effacement y reste correct. Seule la lecture partielle paie, et
 * elle paie QUATRE requêtes, pas cinq : le curseur que la passe irait relire est
 * celui que cette fonction vient de lire pour calculer le compteur qu'elle émet.
 *
 * Ce que ces témoins gèlent, dans l'ordre où ils comptent :
 *   1. le pont voyage quand la lecture est partielle ;
 *   2. le cas dominant reste GRATUIT — aucun appel de passe ;
 *   3. le curseur déjà lu est RÉUTILISÉ, jamais relu ;
 *   4. l'absence de pont reste une absence légitime, jamais fabriquée ;
 *   5. une passe qui tombe ne prive personne de son compteur ;
 *   6. l'invité de lien partagé est servi sous SA clé ;
 *   7. la préférence d'accusés ne tait pas la synchro interne du lecteur ;
 *   8. aucun étage agent sur ce chemin (G-127).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';
import { broadcastReadStatus } from '../broadcastReadStatus';
import { makeChainableIO } from '../../__tests__/helpers/chainable-io';

const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const ACTOR_USER_ID = '507f1f77bcf86cd799439077';
const ACTOR_PARTICIPANT_ID = '507f1f77bcf86cd799439066';
const PEER_PARTICIPANT_ID = '507f1f77bcf86cd799439044';
const PEER_USER_ID = '507f1f77bcf86cd799439055';
const UNREAD_UPDATED = 'conversation:unread-updated';

const LAST_READ_AT = new Date('2026-08-17T10:00:00.000Z');
const LAST_READ_MESSAGE_CREATED_AT = new Date('2026-08-17T09:59:00.000Z');

const aBridge = (unreadCount: number): ConversationBridge => ({
  kind: 'fallback',
  unreadCount,
  suggestedMode: 'focal',
  data: { authors: ['Alice'], extraAuthorCount: 0, messageCount: unreadCount },
});

function makeHarness(overrides: {
  unreadCount?: number;
  cursorRow?: { lastReadAt: Date | null; lastReadMessageCreatedAt: Date | null } | null;
  showReadReceipts?: boolean;
  bridges?: Map<string, { bridge: ConversationBridge }>;
  bridgeThrows?: boolean;
} = {}) {
  const io = makeChainableIO();

  const findUnique = jest.fn<any>().mockResolvedValue(
    overrides.cursorRow === undefined
      ? { lastReadAt: LAST_READ_AT, lastReadMessageCreatedAt: LAST_READ_MESSAGE_CREATED_AT }
      : overrides.cursorRow
  );
  const findMany = jest.fn<any>().mockResolvedValue([
    { id: ACTOR_PARTICIPANT_ID, userId: ACTOR_USER_ID },
    { id: PEER_PARTICIPANT_ID, userId: PEER_USER_ID },
  ]);

  const buildBridgeData = jest.fn<any>(async () => {
    if (overrides.bridgeThrows) throw new Error('bridge pass down');
    return overrides.bridges ?? new Map([[CONVERSATION_ID, { bridge: aBridge(3) }]]);
  });

  const deps = {
    io,
    prisma: {
      conversationReadCursor: { findUnique },
      participant: { findMany },
    } as any,
    readStatusService: {
      getLatestMessageSummary: jest.fn<any>().mockResolvedValue({ lastMessageId: 'm1' }),
      getUnreadCount: jest.fn<any>().mockResolvedValue(overrides.unreadCount ?? 3),
    },
    privacyPreferencesService: {
      shouldShowReadReceipts: jest.fn<any>().mockResolvedValue(overrides.showReadReceipts ?? true),
    },
    bridgeService: { buildBridgeData },
  };

  return { io, deps, buildBridgeData, findUnique };
}

const readArgs = (over: Partial<Record<string, unknown>> = {}) => ({
  conversationId: CONVERSATION_ID,
  participantId: ACTOR_PARTICIPANT_ID,
  userId: ACTOR_USER_ID,
  isAnonymous: false,
  type: 'read' as const,
  ...over,
});

describe('broadcastReadStatus — le pont ✦ sur la resynchro du lecteur', () => {
  beforeEach(() => jest.clearAllMocks());

  it('attaches the bridge to the actor badge when the read left messages BEHIND', async () => {
    const { io, deps } = makeHarness({ unreadCount: 3 });

    await broadcastReadStatus(deps as any, readArgs());

    const payload = io._payloadFor(UNREAD_UPDATED);
    expect(payload).toMatchObject({ conversationId: CONVERSATION_ID, unreadCount: 3 });
    expect(payload.bridge).toEqual(aBridge(3));
  });

  it('builds that bridge for THIS reader, on THIS conversation, with the AUTHORITATIVE count', async () => {
    const { deps, buildBridgeData } = makeHarness({ unreadCount: 3 });

    await broadcastReadStatus(deps as any, readArgs());

    expect(buildBridgeData).toHaveBeenCalledTimes(1);
    const params = buildBridgeData.mock.calls[0][0] as any;
    expect(params.viewerId).toBe(ACTOR_USER_ID);
    expect(params.candidates).toEqual([{ conversationId: CONVERSATION_ID, unreadCount: 3 }]);
  });

  it('does not call the bridge pass AT ALL when the read consumed everything', async () => {
    const { io, deps, buildBridgeData } = makeHarness({ unreadCount: 0 });

    await broadcastReadStatus(deps as any, readArgs());

    // Le cas dominant : lire une conversation la vide. Contrat gelé §3.2 — un
    // compteur nul n'a pas de pont, donc l'effacement client est CORRECT ici.
    expect(buildBridgeData).not.toHaveBeenCalled();
    const payload = io._payloadFor(UNREAD_UPDATED);
    expect(payload).toEqual({ conversationId: CONVERSATION_ID, unreadCount: 0 });
    expect(payload).not.toHaveProperty('bridge');
  });

  it('never reads the cursor twice — the pass gets the one this broadcast already read', async () => {
    const { deps, buildBridgeData, findUnique } = makeHarness({ unreadCount: 3 });

    await broadcastReadStatus(deps as any, readArgs());

    expect(findUnique).toHaveBeenCalledTimes(1);
    const params = buildBridgeData.mock.calls[0][0] as any;
    expect(params.cursorsByParticipant.get(ACTOR_PARTICIPANT_ID)).toEqual({
      lastReadAt: LAST_READ_AT,
      lastReadMessageCreatedAt: LAST_READ_MESSAGE_CREATED_AT,
    });
  });

  it('hands the pass NO cursor entry when this reader has none — never a fabricated one', async () => {
    const { deps, buildBridgeData } = makeHarness({ unreadCount: 3, cursorRow: null });

    await broadcastReadStatus(deps as any, readArgs());

    // Une entrée `{null, null}` dirait « j'ai lu le curseur, il est vide » là où
    // la vérité est « il n'y a pas de curseur » — la passe doit retomber sur
    // `joinedAt`, exactement comme si elle avait lu la table elle-même.
    const params = buildBridgeData.mock.calls[0][0] as any;
    expect(params.cursorsByParticipant.has(ACTOR_PARTICIPANT_ID)).toBe(false);
  });

  it('emits the short form when the pass announces nothing for this conversation', async () => {
    const { io, deps } = makeHarness({ unreadCount: 3, bridges: new Map() });

    await broadcastReadStatus(deps as any, readArgs());

    const payload = io._payloadFor(UNREAD_UPDATED);
    expect(payload).toEqual({ conversationId: CONVERSATION_ID, unreadCount: 3 });
  });

  it('still emits the count when the bridge pass throws', async () => {
    const { io, deps } = makeHarness({ unreadCount: 3, bridgeThrows: true });

    await expect(broadcastReadStatus(deps as any, readArgs())).resolves.toBeUndefined();

    // Le pont est un confort, la pastille est le produit — même posture que le
    // fan-out d'envoi et que l'instantané de reconnexion.
    expect(io._payloadFor(UNREAD_UPDATED)).toEqual({
      conversationId: CONVERSATION_ID,
      unreadCount: 3,
    });
  });

  it('builds the bridge for the identity it ADDRESSES, never a second one', async () => {
    const { io, deps, buildBridgeData } = makeHarness({ unreadCount: 2 });

    // Un invité de lien partagé : `personalRoomKey` retombe sur son
    // `Participant.id` parce qu'il n'a pas de ligne `User`. Le `userId` passé
    // ici est délibérément DIFFÉRENT — un pont construit pour une identité et
    // livré dans la room d'une autre nomme les auteurs que le mauvais lecteur a
    // le droit de voir, et c'est la classe de défaut que le § « Deux identités,
    // deux rôles » de cette unité existe pour interdire.
    await broadcastReadStatus(deps as any, readArgs({ isAnonymous: true }));

    const params = buildBridgeData.mock.calls[0][0] as any;
    expect(params.viewerId).toBe(ACTOR_PARTICIPANT_ID);
    expect(io._roomsFor(UNREAD_UPDATED)).toEqual([`user:${ACTOR_PARTICIPANT_ID}`]);
  });

  it('attaches the bridge even when read receipts are SILENCED', async () => {
    const { io, deps, buildBridgeData } = makeHarness({ unreadCount: 3, showReadReceipts: false });

    await broadcastReadStatus(deps as any, readArgs());

    // La préférence tait la DIFFUSION vers les pairs ; la resynchro du lecteur
    // avec lui-même n'est pas une divulgation. Le badge partait déjà sur cette
    // branche — le pont qui le qualifie part avec lui.
    expect(buildBridgeData).toHaveBeenCalledTimes(1);
    expect(io._payloadFor(UNREAD_UPDATED).bridge).toEqual(aBridge(3));
  });

  it('runs the bridge pass ALONGSIDE the peer fan-out reads, never behind them', async () => {
    const { io, deps } = makeHarness({ unreadCount: 3 });

    // Les trois portes REST ATTENDENT cette fonction avant de répondre. Le
    // témoin est construit pour tomber par TIMEOUT si les deux devenaient
    // sérielles : le résumé ne se résout que lorsque la passe de pont a été
    // appelée. En série (pont après résumé), personne ne débloque personne.
    let releaseSummary!: () => void;
    const summaryCalled = new Promise<void>((resolve) => {
      releaseSummary = resolve;
    });
    deps.readStatusService.getLatestMessageSummary = jest.fn<any>(async () => {
      await summaryCalled;
      return { lastMessageId: 'm1' };
    });
    deps.bridgeService.buildBridgeData = jest.fn<any>(async () => {
      releaseSummary();
      return new Map([[CONVERSATION_ID, { bridge: aBridge(3) }]]);
    });

    await broadcastReadStatus(deps as any, readArgs());

    expect(io._payloadFor(UNREAD_UPDATED).bridge).toEqual(aBridge(3));
  }, 5000);

  it('never opens the agent stage on this path (G-127)', async () => {
    const { deps, buildBridgeData } = makeHarness({ unreadCount: 3 });

    await broadcastReadStatus(deps as any, readArgs());

    expect((buildBridgeData.mock.calls[0][0] as any).agent).toBeUndefined();
  });

  it('computes no bridge on a `received` — no cursor moved, no badge, no pass', async () => {
    const { io, deps, buildBridgeData } = makeHarness({ unreadCount: 3 });

    await broadcastReadStatus(deps as any, readArgs({ type: 'received' }));

    expect(buildBridgeData).not.toHaveBeenCalled();
    expect(io._sendsFor(UNREAD_UPDATED)).toHaveLength(0);
  });

  it('keeps working without a bridge builder at all — the short form, as before', async () => {
    const { io, deps } = makeHarness({ unreadCount: 3 });

    await broadcastReadStatus({ ...deps, bridgeService: undefined } as any, readArgs());

    expect(io._payloadFor(UNREAD_UPDATED)).toEqual({
      conversationId: CONVERSATION_ID,
      unreadCount: 3,
    });
  });
});

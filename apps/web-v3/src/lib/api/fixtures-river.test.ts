import { describe, expect, test } from 'bun:test';

import { RIVER_MIN_VOICES, resolveRiverLanes } from '@meeshy/shared/utils/river-lanes';
import { parseJoinNotice } from '@meeshy/shared/utils/join-notice';

import { resolveRiverGeometry, riverLanesInput } from '@/lib/river/geometry';
import { VIEWER_ID } from './fixtures-base';
import { RIVER_CONVERSATION_ID, RIVER_MESSAGES } from './fixtures-river';
import { RIVER_OPENING_MESSAGES } from './fixtures-river-opening';
import { hasOlderMessagesOf, messagesOf } from './fixtures';

/**
 * LE CORPUS QUI PEUT FAIRE TOMBER UN TÉMOIN (#5696, travail `river`, critère
 * (e)) — `RIVER_OPENING_MESSAGES` prouve, avec `RIVER_MESSAGES`, que la loi
 * de la Rivière ATTEINT les couloirs sur un corpus du jeu de démonstration.
 * Sans cette page, `resolveRiverGeometry` rend `serialized/belowMinimum` sur
 * le Salon Rivière à TOUS les barreaux de l'échelle (deux voix) — le
 * troisième témoin ci-dessous le prouve : c'est la raison d'être de cette
 * page.
 *
 * Les chiffres MESURÉS (`fixtures-river-opening.ts`, doc-comment de
 * `RIVER_OPENING_MESSAGES`) — `laneCount: 6`, `silenceWindowMs: 120 000` —
 * ne sont PAS épinglés ici : ce sont des mesures, pas des lois (§9 question
 * 9 de la spécification). Les témoins affirment `layout`, `voiceCount`, les
 * connecteurs, l'avis et `laneCount >= RIVER_MIN_VOICES`.
 */

const geometryOfOpeningAndReview = () => resolveRiverGeometry([...RIVER_OPENING_MESSAGES, ...RIVER_MESSAGES], VIEWER_ID);

describe('RIVER_OPENING_MESSAGES + RIVER_MESSAGES — l’ouverture et la revue rendent des COULOIRS, jamais serialized', () => {
  test('layout lanes, neuf voix, laneCount atteint le plancher de la loi', () => {
    const geometry = geometryOfOpeningAndReview();
    expect(geometry.layout).toBe('lanes');
    expect(geometry.voiceCount).toBe(9);
    expect(geometry.laneCount).toBeGreaterThanOrEqual(RIVER_MIN_VOICES);
  });
});

describe('au moins trois voix à moins de 30 minutes (RIVER_LANE_SILENCE_WINDOW_MS)', () => {
  test('trois expéditeurs distincts, non-système, tiennent dans la fenêtre par défaut', () => {
    const voices = RIVER_OPENING_MESSAGES.filter((m) => m.messageSource !== 'system');
    const distinctSenders = new Set(voices.map((m) => m.senderId));
    expect(distinctSenders.size).toBeGreaterThanOrEqual(3);

    const times = voices.map((m) => m.createdAt.getTime());
    const span = Math.max(...times) - Math.min(...times);
    expect(span).toBeLessThan(30 * 60 * 1000);
  });
});

describe('une réponse croisée produit un connecteur entre deux couloirs', () => {
  test('riv-open-3 → riv-open-0 traverse deux couloirs distincts', () => {
    const geometry = geometryOfOpeningAndReview();
    const crossing = geometry.connectors.find((connector) => connector.toMessageId === 'riv-open-0');
    expect(crossing).toBeDefined();
    expect(crossing?.fromLaneIndex).not.toBe(crossing?.toLaneIndex);
  });
});

describe('l’avis système descend le temps sans voix ni couloir', () => {
  test('la bulle de l’avis est servie, sans nœud de branche, hors du décompte des voix', () => {
    const geometry = geometryOfOpeningAndReview();
    const notice = geometry.bubbles.find((bubble) => bubble.messageId === 'riv-open-1');
    expect(notice).toBeDefined();
    expect(notice?.isSystem).toBe(true);

    const nodeRanks = new Set(geometry.lanes.flatMap((lane) => lane.spans).flatMap((span) => span.nodes).map((node) => node.rank));
    expect(nodeRanks.has(notice?.rank ?? -1)).toBe(false);
  });

  test('le message porte un avis d’arrivée VALIDE (join-notice.ts) — l’arrivante en est l’auteure', () => {
    const noticeMessage = RIVER_OPENING_MESSAGES.find((m) => m.id === 'riv-open-1');
    expect(noticeMessage).toBeDefined();
    expect(noticeMessage?.messageSource).toBe('system');
    const parsed = parseJoinNotice(noticeMessage?.metadata);
    expect(parsed).not.toBeNull();
    expect(parsed?.participantId).toBe(noticeMessage?.sender?.id);
  });
});

describe('le passage à plus de sept voix déborde à la fenêtre par défaut', () => {
  test('riv-open-2..9 (8 voix hors lecteur) ⇒ serialized/aboveMaximum', () => {
    const burst = RIVER_OPENING_MESSAGES.filter((m) => {
      const rank = Number(m.id.replace('riv-open-', ''));
      return rank >= 2 && rank <= 9;
    });
    expect(burst).toHaveLength(8);
    const geometry = resolveRiverLanes(riverLanesInput(burst, VIEWER_ID));
    expect(geometry.serializationReason).toBe('aboveMaximum');
  });
});

describe('les 40 messages seuls ne PEUVENT PAS faire tomber ce témoin', () => {
  test('deux voix en stricte alternance ⇒ serialized/belowMinimum — la raison d’être de RIVER_OPENING_MESSAGES', () => {
    const geometry = resolveRiverGeometry(RIVER_MESSAGES, VIEWER_ID);
    expect(geometry.layout).toBe('serialized');
    expect(geometry.serializationReason).toBe('belowMinimum');
  });
});

describe('invariants de corpus', () => {
  test('chaque message d’ouverture porte conversationId === RIVER_CONVERSATION_ID', () => {
    for (const m of RIVER_OPENING_MESSAGES) {
      expect(m.conversationId).toBe(RIVER_CONVERSATION_ID);
    }
  });

  test('ids uniques et disjoints des riv-N', () => {
    const openingIds = RIVER_OPENING_MESSAGES.map((m) => m.id);
    expect(new Set(openingIds).size).toBe(openingIds.length);
    const reviewIds = new Set(RIVER_MESSAGES.map((m) => m.id));
    for (const id of openingIds) {
      expect(reviewIds.has(id)).toBe(false);
    }
  });

  test('tous STRICTEMENT antérieurs à riv-0, même dans le pire cas (minutesAgo(50) à 00:30 locale)', () => {
    const rivZero = RIVER_MESSAGES[0];
    expect(rivZero).toBeDefined();
    for (const m of RIVER_OPENING_MESSAGES) {
      expect(m.createdAt.getTime()).toBeLessThan(rivZero?.createdAt.getTime() ?? 0);
    }
  });

  test('messagesOf(c-salon-riviere) reste égal aux 40 — l’ouverture n’est PAS servie par le fil', () => {
    const served = messagesOf(RIVER_CONVERSATION_ID);
    expect(served).toHaveLength(RIVER_MESSAGES.length);
    expect(served.some((m) => m.id.startsWith('riv-open-'))).toBe(false);
  });

  test('hasOlderMessagesOf(c-salon-riviere) reste false', () => {
    expect(hasOlderMessagesOf(RIVER_CONVERSATION_ID)).toBe(false);
  });
});

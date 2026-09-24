import { describe, expect, test } from 'bun:test';

import {
  RIVER_LANE_SILENCE_WINDOW_MS,
  RIVER_MAX_LANES,
  resolveRiverLaneHeaders,
  resolveRiverLanes,
  resolveRiverStep,
  type RiverBubble,
  type RiverCursor,
  type RiverGeometry,
  type RiverLaneHeader,
  type RiverStep,
  type RiverStepDirection,
} from '@meeshy/shared/utils/river-lanes';

import { message, participantDefaults } from '@/lib/api/fixtures-base';
import type { Message, Participant } from '@/lib/api/types';
import { closeEnough, loadSharedVectors, sharedVectorTestName } from '@/test-support/shared-vectors';

import {
  SILENCE_WINDOW_LADDER_MS,
  cursorForMessageId,
  groupPositions,
  initialCursor,
  isAtPresent,
  isRiverVoice,
  joinsAbove,
  joinsBelow,
  resolveRiverGeometry,
  riverDisplayName,
  riverLanesInput,
  riverParticipants,
} from './geometry';

/**
 * LE MAPPING MESSAGES → LOI, prouvé par les 61 vecteurs partagés — #5696,
 * étape 3 (§4.1 de la spécification). Miroir de `RiverConversationMapping`
 * (Core, `apps/ios/Meeshy/Features/Main/Riviere/Core/
 * RiverConversationMapping.swift`).
 */

// ============================================================================
// LE PONT VECTEUR → Message — pour rejouer les vecteurs À TRAVERS le mapping.
// ============================================================================

type VectorRiverMessage = {
  readonly id: string;
  readonly senderId: string;
  readonly createdAt: string | number;
  readonly replyToMessageId?: string | null;
  readonly isSystem?: boolean;
};

type VectorRiverParticipant = {
  readonly id: string;
  readonly displayName: string;
};

type VectorLanesInput = {
  readonly messages: readonly VectorRiverMessage[];
  readonly participants: readonly VectorRiverParticipant[];
  readonly viewerId: string;
  readonly silenceWindowMs?: number;
  readonly dayBoundaryOffsetMinutes?: number;
};

const toSenderParticipant = (vp: VectorRiverParticipant): Participant => ({
  ...participantDefaults,
  id: `p-${vp.id}`,
  userId: vp.id,
  displayName: vp.displayName,
  isOnline: false,
  lastActiveAt: new Date(0),
});

/**
 * `sender` est ABSENT quand l'expéditeur ne figure pas dans
 * `vector.input.participants` — le cas « participant-sorti-du-groupe-graine-
 * de-couleur-par-identifiant » (`ghost`, hors roster) : `riverDisplayName`
 * retombe alors sur `senderId`, exactement comme la graine de couleur
 * originale du vecteur.
 */
const toMessage = (vm: VectorRiverMessage, participants: readonly VectorRiverParticipant[]): Message => {
  const participant = participants.find((candidate) => candidate.id === vm.senderId);
  return message({
    id: vm.id,
    senderId: vm.senderId,
    createdAt: new Date(vm.createdAt),
    messageSource: vm.isSystem === true ? 'system' : 'user',
    content: '',
    originalLanguage: 'fr',
    translations: [],
    ...(vm.replyToMessageId ? { replyToId: vm.replyToMessageId } : {}),
    ...(participant === undefined ? {} : { sender: toSenderParticipant(participant) }),
  });
};

const geometryFromVectorLanes = (input: VectorLanesInput): RiverGeometry => {
  const messages = input.messages.map((vm) => toMessage(vm, input.participants));
  return resolveRiverLanes(
    riverLanesInput(messages, input.viewerId, {
      ...(input.silenceWindowMs === undefined ? {} : { silenceWindowMs: input.silenceWindowMs }),
      ...(input.dayBoundaryOffsetMinutes === undefined ? {} : { dayBoundaryOffsetMinutes: input.dayBoundaryOffsetMinutes }),
    }),
  );
};

// ============================================================================
// LES 61 VECTEURS PARTAGÉS — rejoués À TRAVERS le mapping (§4.1 (a)).
// ============================================================================

describe('vecteurs partagés river-lanes (24) — rejoués à travers riverLanesInput', () => {
  const vectors = loadSharedVectors<VectorLanesInput, RiverGeometry>('river-lanes');

  test('au moins 24 cas sont chargés (leçon 257 : jamais de vert silencieux)', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(24);
  });

  vectors.forEach((vector, index) => {
    test(sharedVectorTestName(index, vector), () => {
      const actual = geometryFromVectorLanes(vector.input);
      expect(closeEnough(actual, vector.expected)).toBe(true);
    });
  });
});

type VectorRiverStepInput = {
  readonly lanes: VectorLanesInput;
  readonly cursor: RiverCursor;
  readonly direction: RiverStepDirection;
};

describe('vecteurs partagés river-step (22)', () => {
  const vectors = loadSharedVectors<VectorRiverStepInput, RiverStep>('river-step');

  test('au moins 22 cas sont chargés', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(22);
  });

  vectors.forEach((vector, index) => {
    test(sharedVectorTestName(index, vector), () => {
      const geometry = geometryFromVectorLanes(vector.input.lanes);
      const actual = resolveRiverStep({ geometry, cursor: vector.input.cursor, direction: vector.input.direction });
      expect(closeEnough(actual, vector.expected)).toBe(true);
    });
  });
});

type VectorRiverHeadersInput = {
  readonly lanes: VectorLanesInput;
  readonly focusRank: number;
  readonly fadeRanks?: number;
};

describe('vecteurs partagés river-headers (15)', () => {
  const vectors = loadSharedVectors<VectorRiverHeadersInput, readonly RiverLaneHeader[]>('river-headers');

  test('au moins 15 cas sont chargés', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(15);
  });

  vectors.forEach((vector, index) => {
    test(sharedVectorTestName(index, vector), () => {
      const geometry = geometryFromVectorLanes(vector.input.lanes);
      const actual = resolveRiverLaneHeaders({
        geometry,
        focusRank: vector.input.focusRank,
        ...(vector.input.fadeRanks === undefined ? {} : { fadeRanks: vector.input.fadeRanks }),
      });
      expect(closeEnough(actual, vector.expected, 1e-4)).toBe(true);
    });
  });
});

// ============================================================================
// riverLanesInput — LE ROSTER.
// ============================================================================

describe('riverLanesInput — le roster', () => {
  test('isRiverVoice : ni un avis système, ni un message supprimé', () => {
    const voice = message({ id: 'm1', senderId: 'u1', content: 'x', originalLanguage: 'fr', translations: [], createdAt: new Date(0) });
    const notice = message({
      id: 'm2',
      senderId: 'u2',
      messageSource: 'system',
      content: 'x',
      originalLanguage: 'fr',
      translations: [],
      createdAt: new Date(0),
    });
    const deleted = message({ id: 'm3', senderId: 'u3', content: 'x', originalLanguage: 'fr', translations: [], createdAt: new Date(0), deletedAt: new Date(0) });
    expect(isRiverVoice(voice)).toBe(true);
    expect(isRiverVoice(notice)).toBe(false);
    expect(isRiverVoice(deleted)).toBe(false);
  });

  test('riverDisplayName : sender.displayName, sinon senderId', () => {
    const named = message({
      id: 'm1',
      senderId: 'u1',
      sender: { ...participantDefaults, id: 'p1', userId: 'u1', displayName: 'Amina', isOnline: false, lastActiveAt: new Date(0) },
      content: 'x',
      originalLanguage: 'fr',
      translations: [],
      createdAt: new Date(0),
    });
    const anonymous = message({ id: 'm2', senderId: 'u2', content: 'x', originalLanguage: 'fr', translations: [], createdAt: new Date(0) });
    expect(riverDisplayName(named)).toBe('Amina');
    expect(riverDisplayName(anonymous)).toBe('u2');
  });

  test('un expéditeur qui change de nom entre deux messages ⇒ UNE entrée, le DERNIER nom', () => {
    const sender = (displayName: string): Participant => ({
      ...participantDefaults,
      id: 'p-u1',
      userId: 'u1',
      displayName,
      isOnline: false,
      lastActiveAt: new Date(0),
    });
    const older = message({ id: 'm1', senderId: 'u1', sender: sender('Ancien Nom'), content: 'x', originalLanguage: 'fr', translations: [], createdAt: new Date(0) });
    const newer = message({ id: 'm2', senderId: 'u1', sender: sender('Nouveau Nom'), content: 'y', originalLanguage: 'fr', translations: [], createdAt: new Date(1000) });

    const participants = riverParticipants([older, newer]);
    expect(participants).toHaveLength(1);
    expect(participants[0]).toEqual({ id: 'u1', displayName: 'Nouveau Nom' });
  });

  test("l'auteur d'un avis qui n'a jamais parlé n'est PAS dans participants", () => {
    const notice = message({
      id: 'j1',
      senderId: 'u-arrivant',
      messageSource: 'system',
      sender: { ...participantDefaults, id: 'p-arrivant', userId: 'u-arrivant', displayName: 'Léa Rivière', isOnline: false, lastActiveAt: new Date(0) },
      content: 'Léa Rivière a rejoint la conversation',
      originalLanguage: 'fr',
      translations: [],
      createdAt: new Date(0),
    });
    const voice = message({ id: 'm1', senderId: 'u1', content: 'x', originalLanguage: 'fr', translations: [], createdAt: new Date(1000) });

    const participants = riverParticipants([notice, voice]);
    expect(participants.map((p) => p.id)).not.toContain('u-arrivant');
    expect(participants.map((p) => p.id)).toEqual(['u1']);
  });

  test('un message deletedAt posé est écarté du mapping — il n’a pas de rang', () => {
    const kept = message({ id: 'm1', senderId: 'u1', content: 'x', originalLanguage: 'fr', translations: [], createdAt: new Date(0) });
    const removed = message({
      id: 'm2',
      senderId: 'u2',
      content: 'supprimé',
      originalLanguage: 'fr',
      translations: [],
      createdAt: new Date(1000),
      deletedAt: new Date(2000),
    });

    const input = riverLanesInput([kept, removed], 'viewer');
    expect(input.messages.map((m) => m.id)).toEqual(['m1']);
  });

  test('ordre = première apparition, pas ordre alphabétique', () => {
    const b = message({ id: 'm1', senderId: 'u-b', content: 'x', originalLanguage: 'fr', translations: [], createdAt: new Date(0) });
    const a = message({ id: 'm2', senderId: 'u-a', content: 'y', originalLanguage: 'fr', translations: [], createdAt: new Date(1000) });
    const c = message({ id: 'm3', senderId: 'u-c', content: 'z', originalLanguage: 'fr', translations: [], createdAt: new Date(2000) });
    const bAgain = message({ id: 'm4', senderId: 'u-b', content: 'w', originalLanguage: 'fr', translations: [], createdAt: new Date(3000) });

    expect(riverParticipants([b, a, c, bAgain]).map((p) => p.id)).toEqual(['u-b', 'u-a', 'u-c']);
  });
});

// ============================================================================
// resolveRiverGeometry — L'ÉCHELLE DE SILENCE.
// ============================================================================

/** Une voix (non-système, non-lecteur) unique, un message. */
const voiceMessage = (id: string, senderId: string, createdAt: Date): Message =>
  message({ id, senderId, content: 'x', originalLanguage: 'fr', translations: [], createdAt });

const VIEWER_ID = 'viewer';
const BASE_TIME = new Date('2026-08-17T09:00:00.000Z').getTime();

describe('resolveRiverGeometry — l’échelle de silence, un cas par barreau', () => {
  /**
   * Pour le barreau `k`, une rafale de 8 voix (hors lecteur) espacées de
   * `SILENCE_WINDOW_LADDER_MS[k] / 4` : par construction SCALE-INVARIANTE
   * (la rafale est un agrandissement/rétrécissement de la même forme), tout
   * barreau PLUS LARGE fait déborder l'axe (`aboveMaximum`, écarté par la
   * recherche) et tout barreau PLUS SERRÉ donne un `laneCount` STRICTEMENT
   * plus petit (`≤ 5`) — jamais mieux. Vérifié en exécutant la loi
   * (`packages/shared/dist/utils/river-lanes.js`) le 2026-09-08 avant
   * d'écrire ce témoin : au barreau `k`, `laneCount === 5` pour LES DIX
   * barreaux (auto-similarité de la construction), et AUCUN barreau plus
   * serré ne dépasse cette valeur.
   */
  /**
   * PIN de longueur — une boucle sur l'échelle ne peut PAS attraper un
   * barreau RETIRÉ (elle générerait un cas de moins, tous encore verts,
   * exactement le « vert silencieux » de la leçon 257). Fixer le compte ICI
   * est ce qui fait tomber EXACTEMENT un cas — celui-ci — quand un barreau
   * disparaît de `SILENCE_WINDOW_LADDER_MS`.
   */
  test("l'échelle porte exactement DIX barreaux — un de moins ferait tomber CE cas, pas simplement disparaître", () => {
    expect(SILENCE_WINDOW_LADDER_MS).toHaveLength(10);
  });

  SILENCE_WINDOW_LADDER_MS.forEach((window, k) => {
    test(`barreau ${k} (${window} ms) est retenu par sa propre rafale`, () => {
      const spacing = window / 4;
      const messages = Array.from({ length: 8 }, (_unused, i) => voiceMessage(`v${i}`, `voice-${i}`, new Date(BASE_TIME + i * spacing)));

      const geometry = resolveRiverGeometry(messages, VIEWER_ID);
      expect(geometry.layout).toBe('lanes');
      expect(geometry.silenceWindowMs).toBe(window);
    });
  });
});

describe('resolveRiverGeometry — aboveMaximum (> 7 voix au même instant)', () => {
  test('8 voix à la même seconde ⇒ tous les barreaux débordent ⇒ repli sur la fenêtre par défaut', () => {
    const t = new Date(BASE_TIME);
    const messages = Array.from({ length: 8 }, (_unused, i) => voiceMessage(`v${i}`, `voice-${i}`, t));

    const geometry = resolveRiverGeometry(messages, VIEWER_ID);
    expect(geometry.layout).toBe('serialized');
    expect(geometry.serializationReason).toBe('aboveMaximum');
    expect(geometry.silenceWindowMs).toBe(RIVER_LANE_SILENCE_WINDOW_MS);
  });
});

describe('resolveRiverGeometry — belowMinimum', () => {
  test('2 voix ⇒ serialized/belowMinimum à la fenêtre par défaut', () => {
    const messages = [voiceMessage('a', 'voice-a', new Date(BASE_TIME)), voiceMessage('b', 'voice-b', new Date(BASE_TIME + 1000))];

    const geometry = resolveRiverGeometry(messages, VIEWER_ID);
    expect(geometry.layout).toBe('serialized');
    expect(geometry.serializationReason).toBe('belowMinimum');
    expect(geometry.silenceWindowMs).toBe(RIVER_LANE_SILENCE_WINDOW_MS);
  });
});

describe('resolveRiverGeometry — l’arrêt à maxLanes et la préséance du plus large', () => {
  test('7 voix au même instant ⇒ laneCount 7 dès le PREMIER barreau (l’arrêt)', () => {
    const t = new Date(BASE_TIME);
    const messages = Array.from({ length: 7 }, (_unused, i) => voiceMessage(`v${i}`, `voice-${i}`, t));

    const geometry = resolveRiverGeometry(messages, VIEWER_ID);
    expect(geometry.layout).toBe('lanes');
    expect(geometry.laneCount).toBe(RIVER_MAX_LANES);
    expect(geometry.silenceWindowMs).toBe(SILENCE_WINDOW_LADDER_MS[0]);
  });

  test('deux barreaux à laneCount ÉGAL ⇒ le plus LARGE gagne (4 voix, 10 min d’écart : laneCount 4 pour LES DIX barreaux)', () => {
    const messages = [0, 1, 2, 3].map((i) => voiceMessage(`v${i}`, `voice-${i}`, new Date(BASE_TIME + i * 10 * 60 * 1000)));

    const geometry = resolveRiverGeometry(messages, VIEWER_ID);
    expect(geometry.layout).toBe('lanes');
    expect(geometry.laneCount).toBe(4);
    expect(geometry.silenceWindowMs).toBe(SILENCE_WINDOW_LADDER_MS[0]);
  });
});

describe('resolveRiverGeometry — l’échelle porte le défaut de la loi comme un barreau, jamais comme un plancher', () => {
  test('SILENCE_WINDOW_LADDER_MS[4] === RIVER_LANE_SILENCE_WINDOW_MS (importé, jamais recopié)', () => {
    expect(SILENCE_WINDOW_LADDER_MS[4]).toBe(RIVER_LANE_SILENCE_WINDOW_MS);
  });

  test("l'échelle est strictement décroissante", () => {
    for (let i = 1; i < SILENCE_WINDOW_LADDER_MS.length; i += 1) {
      expect((SILENCE_WINDOW_LADDER_MS[i] as number) < (SILENCE_WINDOW_LADDER_MS[i - 1] as number)).toBe(true);
    }
  });
});

// ============================================================================
// groupPositions.
// ============================================================================

const bubble = (partial: Partial<RiverBubble> & { readonly messageId: string; readonly rank: number }): RiverBubble => ({
  laneId: 'lane',
  laneIndex: 0,
  createdAtMs: 0,
  isViewer: false,
  replyToMessageId: null,
  isFirstInGroup: true,
  isSystem: false,
  ...partial,
});

describe('groupPositions', () => {
  test('les quatre positions, déduites de isFirstInGroup du rang SUIVANT', () => {
    const bubbles: readonly RiverBubble[] = [
      bubble({ messageId: 'solo', rank: 0, isFirstInGroup: true }),
      bubble({ messageId: 'head', rank: 1, isFirstInGroup: true }),
      bubble({ messageId: 'middle', rank: 2, isFirstInGroup: false }),
      bubble({ messageId: 'tail', rank: 3, isFirstInGroup: false }),
      bubble({ messageId: 'solo2', rank: 4, isFirstInGroup: true }),
    ];

    const positions = groupPositions(bubbles);
    expect(positions.get('solo')).toBe('solo');
    expect(positions.get('head')).toBe('head');
    expect(positions.get('middle')).toBe('middle');
    expect(positions.get('tail')).toBe('tail');
    expect(positions.get('solo2')).toBe('solo');
  });

  test('un avis coupe le groupe qui le précède, et n’en ouvre aucun pour l’arrivant', () => {
    const bubbles: readonly RiverBubble[] = [
      bubble({ messageId: 'a', rank: 0, isFirstInGroup: true }),
      bubble({ messageId: 'b', rank: 1, isFirstInGroup: false }), // aurait continué le groupe de « a »…
      bubble({ messageId: 'notice', rank: 2, isFirstInGroup: true, isSystem: true }), // …mais l'avis s'intercale
      bubble({ messageId: 'c', rank: 3, isFirstInGroup: true }),
    ];

    const positions = groupPositions(bubbles);
    // « b » est suivi par l'avis : le rang suivant ouvre un groupe (isFirstInGroup)
    // ET est un avis — les deux conditions coupent « b » en tail.
    expect(positions.get('b')).toBe('tail');
    expect(positions.get('notice')).toBe('solo');
    expect(positions.get('c')).toBe('solo');
  });

  test('joinsAbove / joinsBelow', () => {
    expect(joinsAbove('solo')).toBe(false);
    expect(joinsAbove('head')).toBe(false);
    expect(joinsAbove('middle')).toBe(true);
    expect(joinsAbove('tail')).toBe(true);

    expect(joinsBelow('solo')).toBe(false);
    expect(joinsBelow('head')).toBe(true);
    expect(joinsBelow('middle')).toBe(true);
    expect(joinsBelow('tail')).toBe(false);
  });
});

// ============================================================================
// cursorForMessageId / initialCursor / isAtPresent.
// ============================================================================

describe('cursorForMessageId / initialCursor / isAtPresent', () => {
  const messages = [
    voiceMessage('a', 'mia', new Date(BASE_TIME)),
    voiceMessage('b', 'sarah', new Date(BASE_TIME + 60_000)),
    voiceMessage('c', 'mia', new Date(BASE_TIME + 120_000)),
  ];
  const notice = message({
    id: 'j',
    senderId: 'lea',
    messageSource: 'system',
    content: 'Léa a rejoint',
    originalLanguage: 'fr',
    translations: [],
    createdAt: new Date(BASE_TIME + 180_000),
  });
  const geometry = resolveRiverLanes(riverLanesInput([...messages, notice], VIEWER_ID));

  test('cursorForMessageId : null hors fenêtre, null sur un avis, sinon (laneIndex, rank)', () => {
    expect(cursorForMessageId('absent', geometry)).toBeNull();
    expect(cursorForMessageId('j', geometry)).toBeNull();
    const cursor = cursorForMessageId('a', geometry);
    expect(cursor).not.toBeNull();
    expect(cursor?.rank).toBe(0);
  });

  test('initialCursor : la bulle la plus RÉCENTE', () => {
    const cursor = initialCursor(geometry);
    expect(cursor.rank).toBe(geometry.rankCount - 1);
  });

  test('initialCursor : (0,0) sur une rivière vide', () => {
    const empty = resolveRiverLanes(riverLanesInput([], VIEWER_ID));
    expect(initialCursor(empty)).toEqual({ laneIndex: 0, rank: 0 });
  });

  test('isAtPresent : vrai au rang le plus récent, faux ailleurs, faux sur une rivière vide', () => {
    const empty = resolveRiverLanes(riverLanesInput([], VIEWER_ID));
    expect(isAtPresent({ laneIndex: 0, rank: 0 }, empty)).toBe(false);
    expect(isAtPresent(initialCursor(geometry), geometry)).toBe(true);
    expect(isAtPresent({ laneIndex: 0, rank: 0 }, geometry)).toBe(false);
  });
});

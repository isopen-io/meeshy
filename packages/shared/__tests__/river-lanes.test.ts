/**
 * Loi de la Rivière — géométrie des couloirs + navigation à deux axes.
 *
 * Ce que ces tests prouvent, et pourquoi (R-130 + AMENDEMENT R2, directive
 * produit du 2026-08-17) :
 *
 *   1. La rivière est une conversation À PLUSIEURS lue sur DEUX axes — le
 *      temps descend (rang), les interlocuteurs se répartissent en largeur
 *      (couloirs). Les deux axes se PARCOURENT : `resolveRiverStep`.
 *   2. Une branche n'est pas une ligne infinie : elle NAÎT à la première
 *      interaction, COURT tant que la conversation l'entretient, MEURT après
 *      un silence, et RENAÎT plus tard — sans jamais changer de colonne
 *      (sinon la rivière tremblerait latéralement à chaque naissance).
 *
 * @see tasks/lentille-workshop-execution.md §7 (amendement R) et §7bis (amendement R2)
 */
import { describe, expect, it } from 'vitest';
import {
  RIVER_LANE_SILENCE_WINDOW_MS,
  resolveRiverLanes,
  resolveRiverLivingLanes,
  resolveRiverStep,
  type ResolveRiverLanesInput,
  type RiverGeometry,
  type RiverMessageInput,
} from '../utils/river-lanes.js';

const MINUTE = 60 * 1000;
const T0 = Date.parse('2026-08-17T09:00:00.000Z');
const SILENCE_MINUTES = RIVER_LANE_SILENCE_WINDOW_MS / MINUTE;

const at = (minutes: number): string => new Date(T0 + minutes * MINUTE).toISOString();

const message = (
  id: string,
  senderId: string,
  minutes: number,
  replyToMessageId: string | null = null,
): RiverMessageInput => ({ id, senderId, createdAt: at(minutes), replyToMessageId });

const input = (
  messages: readonly RiverMessageInput[],
  overrides: Partial<ResolveRiverLanesInput> = {},
): ResolveRiverLanesInput => ({
  messages,
  participants: [
    { id: 'me', displayName: 'Moi' },
    { id: 'mia', displayName: 'Mia' },
    { id: 'sarah', displayName: 'Sarah' },
    { id: 'tom', displayName: 'Tom' },
    { id: 'lena', displayName: 'Lena' },
  ],
  viewerId: 'me',
  ...overrides,
});

const laneOf = (geometry: RiverGeometry, laneId: string) => {
  const lane = geometry.lanes.find((candidate) => candidate.laneId === laneId);
  if (!lane) throw new Error(`couloir ${laneId} absent de la géométrie`);
  return lane;
};

describe('resolveRiverLanes — l’axe vertical est le temps, jamais l’ordre d’entrée', () => {
  it('classe les bulles chronologiquement quel que soit l’ordre des messages reçus', () => {
    const geometry = resolveRiverLanes(
      input([message('c', 'mia', 4), message('a', 'me', 0), message('b', 'sarah', 2)]),
    );

    expect(geometry.bubbles.map((bubble) => bubble.messageId)).toEqual(['a', 'b', 'c']);
    expect(geometry.bubbles.map((bubble) => bubble.rank)).toEqual([0, 1, 2]);
    expect(geometry.rankCount).toBe(3);
  });

  it('ordonne à égalité d’horodatage par identifiant, pour que deux plateformes dessinent la même rivière', () => {
    const geometry = resolveRiverLanes(input([message('b2', 'mia', 1), message('a1', 'sarah', 1)]));

    expect(geometry.bubbles.map((bubble) => bubble.messageId)).toEqual(['a1', 'b2']);
  });

  it('écarte un message dont l’horodatage est illisible plutôt que de lui inventer un rang', () => {
    const geometry = resolveRiverLanes(
      input([
        message('a', 'mia', 0),
        { id: 'cassé', senderId: 'sarah', createdAt: 'pas-une-date', replyToMessageId: null },
      ]),
    );

    expect(geometry.bubbles.map((bubble) => bubble.messageId)).toEqual(['a']);
    expect(geometry.lanes.map((lane) => lane.laneId)).toEqual(['mia']);
  });

  it('sert l’heure de chaque bulle — elle vit en base de bulle, la peau la formate', () => {
    const geometry = resolveRiverLanes(input([message('a', 'mia', 3)]));

    expect(geometry.bubbles[0].createdAtMs).toBe(T0 + 3 * MINUTE);
  });
});

describe('resolveRiverLanes — l’axe horizontal n’existe que par les interactions', () => {
  it('ne donne aucune branche à un participant qui n’a rien fait dans la fenêtre', () => {
    const geometry = resolveRiverLanes(input([message('a', 'me', 0), message('b', 'mia', 1)]));

    expect(geometry.lanes.map((lane) => lane.laneId)).toEqual(['me', 'mia']);
    expect(geometry.laneCount).toBe(2);
  });

  it('installe le lecteur en colonne 0 — la rive depuis laquelle il regarde — même s’il parle en dernier', () => {
    const geometry = resolveRiverLanes(
      input([message('a', 'mia', 0), message('b', 'sarah', 1), message('c', 'me', 2)]),
    );

    expect(laneOf(geometry, 'me').laneIndex).toBe(0);
    expect(laneOf(geometry, 'me').isViewer).toBe(true);
    expect(laneOf(geometry, 'mia').laneIndex).toBe(1);
    expect(laneOf(geometry, 'sarah').laneIndex).toBe(2);
  });

  it('n’invente pas de rive quand le lecteur n’a pas interagi', () => {
    const geometry = resolveRiverLanes(input([message('a', 'mia', 0), message('b', 'sarah', 1)]));

    expect(geometry.lanes.map((lane) => lane.laneId)).toEqual(['mia', 'sarah']);
    expect(geometry.lanes.every((lane) => lane.isViewer === false)).toBe(true);
  });

  it('réserve la colonne : une branche née plus tard ne déplace jamais les branches déjà tracées', () => {
    const early = resolveRiverLanes(input([message('a', 'mia', 0), message('b', 'sarah', 1)]));
    const late = resolveRiverLanes(
      input([message('a', 'mia', 0), message('b', 'sarah', 1), message('c', 'tom', 2)]),
    );

    expect(laneOf(late, 'mia').laneIndex).toBe(laneOf(early, 'mia').laneIndex);
    expect(laneOf(late, 'sarah').laneIndex).toBe(laneOf(early, 'sarah').laneIndex);
    expect(laneOf(late, 'tom').laneIndex).toBe(2);
  });

  it('prend l’identifiant pour graine de couleur quand le participant a quitté le groupe', () => {
    const geometry = resolveRiverLanes(
      input([message('a', 'ghost', 0)], { participants: [{ id: 'me', displayName: 'Moi' }] }),
    );

    expect(laneOf(geometry, 'ghost').colorSeed).toBe('ghost');
  });

  it('nomme la graine de couleur du participant connu, sans jamais calculer la couleur', () => {
    const geometry = resolveRiverLanes(input([message('a', 'mia', 0)]));

    expect(laneOf(geometry, 'mia').colorSeed).toBe('Mia');
  });
});

describe('resolveRiverLanes — la branche naît, court, meurt, renaît, et garde sa colonne', () => {
  it('garde une seule branche continue tant que le silence reste sous la fenêtre', () => {
    const geometry = resolveRiverLanes(
      input([message('a', 'mia', 0), message('b', 'mia', SILENCE_MINUTES - 1)]),
    );

    expect(laneOf(geometry, 'mia').spans).toHaveLength(1);
    expect(laneOf(geometry, 'mia').spans[0]).toMatchObject({ startRank: 0, endRank: 1 });
  });

  it('fait COURIR la branche à travers les messages des autres, tant que l’instant dure', () => {
    const geometry = resolveRiverLanes(
      input([message('a', 'mia', 0), message('b', 'sarah', 1), message('c', 'tom', 2)]),
    );

    expect(laneOf(geometry, 'mia').spans[0]).toMatchObject({ startRank: 0, endRank: 2 });
  });

  it('coupe la branche quand le silence dépasse la fenêtre, et la fait renaître dans sa colonne', () => {
    const geometry = resolveRiverLanes(
      input([
        message('a', 'mia', 0),
        message('b', 'sarah', 1),
        message('c', 'mia', SILENCE_MINUTES + 10),
      ]),
    );

    const mia = laneOf(geometry, 'mia');
    expect(mia.spans).toHaveLength(2);
    expect(mia.spans[0]).toMatchObject({ startRank: 0, endRank: 1, isOpen: false });
    expect(mia.spans[1]).toMatchObject({ startRank: 2, endRank: 2, isOpen: true });
    // Renaître ne coûte pas sa colonne : Mia reste devant Sarah, née après elle.
    expect(mia.laneIndex).toBe(0);
    expect(laneOf(geometry, 'sarah').laneIndex).toBe(1);
  });

  it('laisse OUVERT le segment qui touche le bas de la fenêtre — on ne sait pas encore s’il s’éteint', () => {
    const geometry = resolveRiverLanes(input([message('a', 'mia', 0), message('b', 'sarah', 1)]));

    expect(laneOf(geometry, 'mia').spans[0].isOpen).toBe(true);
    expect(laneOf(geometry, 'sarah').spans[0].isOpen).toBe(true);
  });

  it('fait reparaître la branche de celle à qui l’on répond — on vit tant qu’on parle, ou qu’on vous parle', () => {
    const geometry = resolveRiverLanes(
      input([
        message('a', 'mia', 0),
        message('b', 'sarah', SILENCE_MINUTES + 5),
        message('c', 'tom', SILENCE_MINUTES + 6, 'a'),
      ]),
    );

    const mia = laneOf(geometry, 'mia');
    expect(mia.spans).toHaveLength(2);
    expect(mia.spans[0]).toMatchObject({ startRank: 0, endRank: 0, isOpen: false });
    expect(mia.spans[1]).toMatchObject({ startRank: 2, endRank: 2 });
    expect(mia.spans[1].nodes).toEqual([{ rank: 2, kind: 'addressed', messageId: 'c' }]);
  });

  it('ne double pas le nœud quand on se répond à soi-même', () => {
    const geometry = resolveRiverLanes(input([message('a', 'mia', 0), message('b', 'mia', 1, 'a')]));

    expect(laneOf(geometry, 'mia').spans[0].nodes).toEqual([
      { rank: 0, kind: 'bubble', messageId: 'a' },
      { rank: 1, kind: 'bubble', messageId: 'b' },
    ]);
  });

  it('porte les bulles de la branche comme nœuds de contournement, dans l’ordre du temps', () => {
    const geometry = resolveRiverLanes(
      input([message('a', 'mia', 0), message('b', 'sarah', 1), message('c', 'mia', 2)]),
    );

    expect(laneOf(geometry, 'mia').spans[0].nodes).toEqual([
      { rank: 0, kind: 'bubble', messageId: 'a' },
      { rank: 2, kind: 'bubble', messageId: 'c' },
    ]);
  });

  it('accepte une fenêtre de silence fournie par l’appelant, sans réécrire la loi', () => {
    const geometry = resolveRiverLanes(
      input([message('a', 'mia', 0), message('b', 'mia', 2)], { silenceWindowMs: MINUTE }),
    );

    expect(laneOf(geometry, 'mia').spans).toHaveLength(2);
    expect(geometry.silenceWindowMs).toBe(MINUTE);
  });
});

describe('resolveRiverLanes — les connecteurs de réponse ne pendent jamais dans le vide', () => {
  it('relie la réponse au message répondu, d’un couloir à l’autre', () => {
    const geometry = resolveRiverLanes(input([message('a', 'mia', 0), message('b', 'me', 1, 'a')]));

    expect(geometry.connectors).toEqual([
      {
        fromMessageId: 'b',
        toMessageId: 'a',
        fromLaneIndex: 0,
        toLaneIndex: 1,
        fromRank: 1,
        toRank: 0,
      },
    ]);
  });

  it('ne trace aucun connecteur vers un message hors fenêtre', () => {
    const geometry = resolveRiverLanes(
      input([message('a', 'mia', 0), message('b', 'me', 1, 'message-d-avant-hier')]),
    );

    expect(geometry.connectors).toEqual([]);
  });

  it('garde le connecteur d’une réponse à soi-même, dans son propre couloir', () => {
    const geometry = resolveRiverLanes(input([message('a', 'mia', 0), message('b', 'mia', 1, 'a')]));

    expect(geometry.connectors).toHaveLength(1);
    expect(geometry.connectors[0]).toMatchObject({ fromLaneIndex: 0, toLaneIndex: 0 });
  });
});

describe('resolveRiverLivingLanes — seules les branches vivantes sont navigables', () => {
  const geometry = resolveRiverLanes(
    input([
      message('a', 'mia', 0),
      message('b', 'sarah', 1),
      message('c', 'tom', SILENCE_MINUTES + 5),
    ]),
  );

  it('ne rend que les couloirs vivants à ce rang, en ordre de colonne', () => {
    expect(resolveRiverLivingLanes(geometry, 0)).toEqual([0]);
    expect(resolveRiverLivingLanes(geometry, 1)).toEqual([0, 1]);
    expect(resolveRiverLivingLanes(geometry, 2)).toEqual([2]);
  });

  it('rend un axe vide hors des rangs de la fenêtre', () => {
    expect(resolveRiverLivingLanes(geometry, 9)).toEqual([]);
  });
});

describe('resolveRiverStep — l’axe horizontal traverse les vivants, sans quitter l’instant', () => {
  const braid = resolveRiverLanes(
    input([
      message('a', 'me', 0),
      message('b', 'mia', 1),
      message('c', 'sarah', 2),
      message('d', 'mia', 3),
    ]),
  );

  it('saute au couloir vivant suivant et se pose sur sa bulle', () => {
    const step = resolveRiverStep({
      geometry: braid,
      cursor: { laneIndex: 0, rank: 3 },
      direction: 'right',
    });

    expect(step).toEqual({ cursor: { laneIndex: 1, rank: 3 }, reason: 'moved' });
  });

  it('à égale distance, se pose sur la bulle la plus ANCIENNE — traverser ne fait pas sauter en avant', () => {
    const step = resolveRiverStep({
      geometry: braid,
      cursor: { laneIndex: 0, rank: 2 },
      direction: 'right',
    });

    expect(step).toEqual({ cursor: { laneIndex: 1, rank: 1 }, reason: 'moved' });
  });

  it('enjambe une branche morte à ce rang au lieu de s’y arrêter', () => {
    const geometry = resolveRiverLanes(
      input([
        message('a', 'mia', 0),
        message('b', 'sarah', 1),
        message('c', 'tom', SILENCE_MINUTES + 10),
        message('d', 'me', SILENCE_MINUTES + 11),
      ]),
    );

    const step = resolveRiverStep({
      geometry,
      cursor: { laneIndex: laneOf(geometry, 'tom').laneIndex, rank: 3 },
      direction: 'left',
    });

    expect(step.cursor).toEqual({ laneIndex: laneOf(geometry, 'me').laneIndex, rank: 3 });
    expect(step.reason).toBe('moved');
  });

  it('garde la hauteur d’où l’on vient quand la branche d’arrivée est reparue sans bulle', () => {
    const geometry = resolveRiverLanes(
      input([
        message('a', 'mia', 0),
        message('b', 'sarah', SILENCE_MINUTES + 5),
        message('c', 'tom', SILENCE_MINUTES + 6, 'a'),
      ]),
    );

    const step = resolveRiverStep({
      geometry,
      cursor: { laneIndex: laneOf(geometry, 'sarah').laneIndex, rank: 2 },
      direction: 'left',
    });

    expect(step).toEqual({
      cursor: { laneIndex: laneOf(geometry, 'mia').laneIndex, rank: 2 },
      reason: 'moved',
    });
  });

  it('reste sur place au bord de l’axe, et le dit', () => {
    const step = resolveRiverStep({
      geometry: braid,
      cursor: { laneIndex: 0, rank: 0 },
      direction: 'left',
    });

    expect(step).toEqual({ cursor: { laneIndex: 0, rank: 0 }, reason: 'edge' });
  });

  it('dit `edge` quand personne d’autre ne vit à cette hauteur', () => {
    const step = resolveRiverStep({
      geometry: braid,
      cursor: { laneIndex: 0, rank: 0 },
      direction: 'right',
    });

    expect(step).toEqual({ cursor: { laneIndex: 0, rank: 0 }, reason: 'edge' });
  });
});

describe('resolveRiverStep — l’axe vertical suit la personne, à travers ses disparitions', () => {
  const followMia = resolveRiverLanes(
    input([
      message('a', 'mia', 0),
      message('b', 'sarah', 1),
      message('c', 'tom', 2),
      message('d', 'mia', SILENCE_MINUTES + 10),
    ]),
  );
  const miaLane = laneOf(followMia, 'mia').laneIndex;

  it('descend d’une bulle de Mia à la suivante, par-dessus la mort de sa branche', () => {
    const step = resolveRiverStep({
      geometry: followMia,
      cursor: { laneIndex: miaLane, rank: 0 },
      direction: 'down',
    });

    expect(step).toEqual({ cursor: { laneIndex: miaLane, rank: 3 }, reason: 'moved' });
  });

  it('remonte symétriquement', () => {
    const step = resolveRiverStep({
      geometry: followMia,
      cursor: { laneIndex: miaLane, rank: 3 },
      direction: 'up',
    });

    expect(step).toEqual({ cursor: { laneIndex: miaLane, rank: 0 }, reason: 'moved' });
  });

  it('s’arrête à la dernière bulle de la branche', () => {
    const step = resolveRiverStep({
      geometry: followMia,
      cursor: { laneIndex: miaLane, rank: 3 },
      direction: 'down',
    });

    expect(step).toEqual({ cursor: { laneIndex: miaLane, rank: 3 }, reason: 'edge' });
  });

  it('dit `empty` sur une rivière sans aucune branche, plutôt que d’inventer un curseur', () => {
    const geometry = resolveRiverLanes(input([]));

    expect(
      resolveRiverStep({ geometry, cursor: { laneIndex: 0, rank: 0 }, direction: 'down' }),
    ).toEqual({ cursor: { laneIndex: 0, rank: 0 }, reason: 'empty' });
  });

  it('dit `empty` quand le curseur désigne une colonne qui n’existe pas', () => {
    const step = resolveRiverStep({
      geometry: followMia,
      cursor: { laneIndex: 42, rank: 0 },
      direction: 'down',
    });

    expect(step).toEqual({ cursor: { laneIndex: 42, rank: 0 }, reason: 'empty' });
  });
});

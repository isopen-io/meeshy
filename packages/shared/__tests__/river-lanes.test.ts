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
  RIVER_MAX_LANES,
  RIVER_MIN_VOICES,
  resolveRiverLaneAt,
  resolveRiverLaneHeaders,
  resolveRiverLanes,
  resolveRiverLivingLanes,
  resolveRiverStep,
  type ResolveRiverLanesInput,
  type RiverGeometry,
  type RiverMessageInput,
} from '../utils/river-lanes.js';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const T0 = Date.parse('2026-08-17T09:00:00.000Z');
const SILENCE_MINUTES = RIVER_LANE_SILENCE_WINDOW_MS / MINUTE;

const at = (minutes: number): string => new Date(T0 + minutes * MINUTE).toISOString();

const message = (
  id: string,
  senderId: string,
  minutes: number,
  replyToMessageId: string | null = null,
): RiverMessageInput => ({ id, senderId, createdAt: at(minutes), replyToMessageId });

/**
 * Un avis SYSTÈME — « X a rejoint la conversation ». Il porte l'ARRIVANT pour
 * auteur (`packages/shared/utils/join-notice.ts`) : c'est précisément ce qui
 * rendait la loi aveugle.
 */
const notice = (id: string, senderId: string, minutes: number): RiverMessageInput => ({
  id,
  senderId,
  createdAt: at(minutes),
  replyToMessageId: null,
  isSystem: true,
});

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
    const geometry = resolveRiverLanes(
      input([message('a', 'me', 0), message('b', 'mia', 1), message('c', 'sarah', 2)]),
    );

    expect(geometry.lanes.map((lane) => lane.laneId)).toEqual(['me', 'mia', 'sarah']);
    expect(geometry.laneCount).toBe(3);
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
    const geometry = resolveRiverLanes(
      input([message('a', 'mia', 0), message('b', 'sarah', 1), message('c', 'tom', 2)]),
    );

    expect(geometry.lanes.map((lane) => lane.laneId)).toEqual(['mia', 'sarah', 'tom']);
    expect(geometry.lanes.every((lane) => lane.isViewer === false)).toBe(true);
  });

  it('réserve la colonne : une branche née plus tard ne déplace jamais les branches déjà tracées', () => {
    const early = resolveRiverLanes(
      input([message('a', 'mia', 0), message('b', 'sarah', 1), message('c', 'tom', 2)]),
    );
    const late = resolveRiverLanes(
      input([
        message('a', 'mia', 0),
        message('b', 'sarah', 1),
        message('c', 'tom', 2),
        message('d', 'lena', 3),
      ]),
    );

    expect(laneOf(late, 'mia').laneIndex).toBe(laneOf(early, 'mia').laneIndex);
    expect(laneOf(late, 'sarah').laneIndex).toBe(laneOf(early, 'sarah').laneIndex);
    expect(laneOf(late, 'tom').laneIndex).toBe(laneOf(early, 'tom').laneIndex);
    expect(laneOf(late, 'lena').laneIndex).toBe(3);
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
        message('c', 'tom', 2),
        message('d', 'mia', SILENCE_MINUTES + 10),
      ]),
    );

    const mia = laneOf(geometry, 'mia');
    expect(mia.spans).toHaveLength(2);
    expect(mia.spans[0]).toMatchObject({ startRank: 0, endRank: 2, isOpen: false });
    expect(mia.spans[1]).toMatchObject({ startRank: 3, endRank: 3, isOpen: true });
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
    const geometry = resolveRiverLanes(
      input([message('a', 'mia', 0), message('b', 'me', 1, 'a'), message('c', 'sarah', 2)]),
    );

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
    const geometry = resolveRiverLanes(
      input([
        message('a', 'mia', 0),
        message('b', 'mia', 1, 'a'),
        message('c', 'sarah', 2),
        message('d', 'tom', 3),
      ]),
    );

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

describe('partage de colonnes — l’axe horizontal reste par colonne, pas par naissance', () => {
  /**
   * Plus de voix (9) que de couloirs (`RIVER_MAX_LANES` = 7), mais jamais plus
   * de 7 vivantes à la fois : la rivière tient en `lanes` (pas `serialized`) et
   * `packColumns` RÉUTILISE des colonnes libérées. Une voix née plus tard (E, F,
   * G) hérite alors d’une colonne PLUS BASSE qu’une voix née plus tôt et encore
   * vivante (D, colonne 4). L’ordre de `geometry.lanes` est l’ordre de
   * NAISSANCE — donc pas l’ordre de colonne. Vague 1 (A, B, C) meurt avant que la
   * vague 2 (E, F, G, H) ne naisse, après la fenêtre de silence ; D court sans
   * discontinuer et garde la colonne 4.
   */
  const wide = resolveRiverLanes(
    input(
      [
        message('v0', 'V', 0),
        message('a', 'A', 1),
        message('b', 'B', 2),
        message('c', 'C', 3),
        message('d0', 'D', 4),
        message('d1', 'D', 30),
        message('e', 'E', 50),
        message('f', 'F', 51),
        message('g', 'G', 52),
        message('h', 'H', 53),
        message('d2', 'D', 55),
        message('v1', 'V', 56),
        message('v2', 'V', 80),
      ],
      {
        viewerId: 'V',
        participants: ['V', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((id) => ({
          id,
          displayName: id,
        })),
      },
    ),
  );

  it('confirme le décor : la rivière partage des colonnes en restant sur deux axes', () => {
    expect(wide.layout).toBe('lanes');
    expect(laneOf(wide, 'D').laneIndex).toBe(4);
    expect(laneOf(wide, 'E').laneIndex).toBe(1);
    expect(laneOf(wide, 'H').laneIndex).toBe(5);
  });

  it('rend les couloirs vivants PAR COLONNE CROISSANTE, jamais par ordre de naissance', () => {
    // Au rang 9, D(4) E(1) F(2) G(3) H(5) vivent. En ordre de naissance :
    // [4, 1, 2, 3, 5] ; l’axe horizontal exige [1, 2, 3, 4, 5].
    expect(resolveRiverLivingLanes(wide, 9)).toEqual([1, 2, 3, 4, 5]);
  });

  it('pas à DROITE : atteint la colonne voisine, sans sauter par-dessus des couloirs vivants', () => {
    // Depuis la colonne 1 (E), le voisin de droite est la colonne 2 (F), pas la
    // colonne 4 (D, née avant mais rangée plus loin).
    const step = resolveRiverStep({
      geometry: wide,
      cursor: { laneIndex: 1, rank: 9 },
      direction: 'right',
    });

    expect(step.cursor.laneIndex).toBe(2);
    expect(step.reason).toBe('moved');
  });

  it('pas à GAUCHE : atteint la colonne voisine la plus proche, pas la première née', () => {
    // Depuis la colonne 5 (H), le voisin de gauche le plus proche est la
    // colonne 4 (D), pas la colonne 3 (G).
    const step = resolveRiverStep({
      geometry: wide,
      cursor: { laneIndex: 5, rank: 9 },
      direction: 'left',
    });

    expect(step.cursor.laneIndex).toBe(4);
    expect(step.reason).toBe('moved');
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

/**
 * Bornes de l'axe horizontal — directive produit du 2026-08-17 : « on limite à
 * 7 utilisateurs en horizontal et 3 minimum, sinon on sérialise en vertical ».
 */
const crowd = (count: number, minutes: (index: number) => number): ResolveRiverLanesInput => ({
  messages: Array.from({ length: count }, (_unused, index) =>
    message(`m${index}`, `p${index}`, minutes(index)),
  ),
  participants: Array.from({ length: count }, (_unused, index) => ({
    id: `p${index}`,
    displayName: `P${index}`,
  })),
  viewerId: 'absent',
});

describe('resolveRiverLanes — la rivière a une largeur, et un seuil en dessous duquel elle n’en est plus une', () => {
  it('tient ses deux axes dès trois voix', () => {
    const geometry = resolveRiverLanes(
      input([message('a', 'mia', 0), message('b', 'sarah', 1), message('c', 'tom', 2)]),
    );

    expect(geometry.layout).toBe('lanes');
    expect(geometry.serializationReason).toBeNull();
    expect(geometry.voiceCount).toBe(3);
  });

  it('sérialise à deux voix : l’alternance dit déjà tout ce que des couloirs diraient', () => {
    const geometry = resolveRiverLanes(input([message('a', 'mia', 0), message('b', 'sarah', 1)]));

    expect(geometry.layout).toBe('serialized');
    expect(geometry.serializationReason).toBe('belowMinimum');
    expect(geometry.laneCount).toBe(1);
    expect(geometry.lanes.every((lane) => lane.laneIndex === 0)).toBe(true);
    expect(geometry.bubbles.every((bubble) => bubble.laneIndex === 0)).toBe(true);
  });

  it('ne compte pas comme une voix celui qu’on interpelle sans qu’il parle', () => {
    const geometry = resolveRiverLanes(
      input([message('a', 'mia', 0), message('b', 'sarah', 1, 'a'), message('c', 'mia', 2)]),
    );

    expect(geometry.voiceCount).toBe(2);
    expect(geometry.serializationReason).toBe('belowMinimum');
  });

  it('tient sept couloirs — et sérialise au huitième dans le même instant', () => {
    const seven = resolveRiverLanes(crowd(7, () => 0));
    const eight = resolveRiverLanes(crowd(8, () => 0));

    expect(seven.layout).toBe('lanes');
    expect(seven.laneCount).toBe(7);
    expect(eight.layout).toBe('serialized');
    expect(eight.serializationReason).toBe('aboveMaximum');
  });

  it('accepte plus de voix que de couloirs quand elles ne parlent pas en même temps : les colonnes se PARTAGENT', () => {
    // Dix voix, chacune un instant à elle — jamais deux vivantes ensemble.
    const geometry = resolveRiverLanes(crowd(10, (index) => index * (SILENCE_MINUTES + 5)));

    expect(geometry.layout).toBe('lanes');
    expect(geometry.lanes).toHaveLength(10);
    expect(geometry.laneCount).toBe(1);
    expect(geometry.lanes.every((lane) => lane.laneIndex === 0)).toBe(true);
  });

  it('ne partage JAMAIS une colonne tant que la rivière tient dans sa largeur', () => {
    // Mêmes silences, mais sept voix seulement : chacune garde sa colonne, même
    // morte. Le partage est un recours, pas une optimisation.
    const geometry = resolveRiverLanes(crowd(7, (index) => index * (SILENCE_MINUTES + 5)));

    expect(geometry.laneCount).toBe(7);
    expect(geometry.lanes.map((lane) => lane.laneIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('garde la rive au lecteur seul, sans jamais l’asseoir sur une autre voix', () => {
    const geometry = resolveRiverLanes({
      ...crowd(9, (index) => index * (SILENCE_MINUTES + 5)),
      messages: [
        message('mine', 'me', 0),
        ...Array.from({ length: 9 }, (_unused, index) =>
          message(`m${index}`, `p${index}`, (index + 1) * (SILENCE_MINUTES + 5)),
        ),
      ],
      viewerId: 'me',
    });

    expect(geometry.layout).toBe('lanes');
    expect(laneOf(geometry, 'me').laneIndex).toBe(0);
    expect(geometry.lanes.filter((lane) => lane.laneIndex === 0)).toHaveLength(1);
  });

  it('sert ses bornes dans la géométrie, pour qu’aucune peau ne les réécrive en dur', () => {
    const geometry = resolveRiverLanes(input([message('a', 'mia', 0)]));

    expect(geometry.maxLanes).toBe(RIVER_MAX_LANES);
    expect(geometry.minVoices).toBe(RIVER_MIN_VOICES);
  });

  it('accepte des bornes fournies par l’appelant, sans réécrire la loi', () => {
    const geometry = resolveRiverLanes(
      input([message('a', 'mia', 0), message('b', 'sarah', 1)], { minVoices: 2 }),
    );

    expect(geometry.layout).toBe('lanes');
    expect(resolveRiverLanes({ ...crowd(4, () => 0), maxLanes: 3 }).serializationReason).toBe(
      'aboveMaximum',
    );
  });
});

describe('resolveRiverLanes — la tête de groupe porte l’identité, à l’identique du Fil', () => {
  it('ouvre un groupe au premier rang', () => {
    const geometry = resolveRiverLanes(input([message('a', 'mia', 0)]));

    expect(geometry.bubbles[0].isFirstInGroup).toBe(true);
  });

  it('ne répète pas l’en-tête sur deux messages consécutifs de la même personne', () => {
    const geometry = resolveRiverLanes(
      input([
        message('a', 'mia', 0),
        message('b', 'mia', 1),
        message('c', 'sarah', 2),
        message('d', 'tom', 3),
      ]),
    );

    expect(geometry.bubbles.map((bubble) => bubble.isFirstInGroup)).toEqual([
      true,
      false,
      true,
      true,
    ]);
  });

  it('rouvre un groupe au changement de jour, même sans changer d’expéditeur', () => {
    const geometry = resolveRiverLanes(
      input([message('a', 'mia', 0), message('b', 'mia', 20 * 60)], { silenceWindowMs: DAY }),
    );

    // 09:00 UTC puis 05:00 UTC le lendemain : deux jours en UTC.
    expect(geometry.bubbles.map((bubble) => bubble.isFirstInGroup)).toEqual([true, true]);
  });

  it('lit la frontière du jour dans le calendrier du lecteur, pas dans celui du serveur', () => {
    const geometry = resolveRiverLanes(
      input([message('a', 'mia', 0), message('b', 'mia', 20 * 60)], {
        silenceWindowMs: DAY,
        // Fuseau à −8 h : les deux messages retombent dans la même journée locale.
        dayBoundaryOffsetMinutes: -8 * 60,
      }),
    );

    expect(geometry.bubbles.map((bubble) => bubble.isFirstInGroup)).toEqual([true, false]);
  });
});

/**
 * Un avis d'arrivée n'est la voix de personne (miroir Rivière de la règle déjà
 * tenue par `apps/web/utils/message-grouping.ts` et
 * `MessageDayGrouping.isGroupHead`) — il descend l'axe du TEMPS avec les
 * autres, et n'entre dans aucun des deux autres axes de la loi : ni la voix,
 * ni le couloir.
 */
describe('resolveRiverLanes — un avis système n’est la voix de personne', () => {
  it('ne laisse pas la première vraie bulle de l’arrivant continuer le groupe de sa propre annonce', () => {
    const geometry = resolveRiverLanes(
      input([notice('j', 'lena', 0), message('a', 'lena', 1), message('b', 'lena', 2)]),
    );

    expect(geometry.bubbles.map((bubble) => bubble.isFirstInGroup)).toEqual([true, true, false]);
  });

  it('ne continue le groupe d’aucun voisin — ni comme prédécesseur, ni comme successeur', () => {
    const geometry = resolveRiverLanes(
      input([message('a', 'mia', 0), notice('j', 'mia', 1), message('b', 'mia', 2)]),
    );

    expect(geometry.bubbles.map((bubble) => bubble.isFirstInGroup)).toEqual([true, true, true]);
  });

  it('ne compte pas l’annonce comme une VOIX — deux voix restent deux voix, et la rivière se sérialise', () => {
    const geometry = resolveRiverLanes(
      input([message('a', 'mia', 0), message('b', 'sarah', 1), notice('j', 'lena', 2)]),
    );

    expect(geometry.voiceCount).toBe(2);
    expect(geometry.layout).toBe('serialized');
    expect(geometry.serializationReason).toBe('belowMinimum');
  });

  it('ne donne AUCUN couloir à qui n’a fait qu’arriver', () => {
    const geometry = resolveRiverLanes(
      input([message('a', 'mia', 0), message('b', 'sarah', 1), notice('j', 'lena', 2)]),
    );

    expect(geometry.lanes.map((lane) => lane.laneId)).toEqual(['mia', 'sarah']);
  });

  it('fait naître la branche de l’arrivant à sa première PAROLE, jamais à son annonce', () => {
    const geometry = resolveRiverLanes(
      input([
        message('a', 'mia', 0),
        message('b', 'sarah', 1),
        notice('j', 'lena', 2),
        message('c', 'lena', 3),
      ]),
    );

    expect(geometry.voiceCount).toBe(3);
    expect(laneOf(geometry, 'lena').spans).toEqual([
      { startRank: 3, endRank: 3, isOpen: true, nodes: [{ rank: 3, kind: 'bubble', messageId: 'c' }] },
    ]);
  });

  it('n’ajoute aucun nœud à la branche de celui que l’annonce concerne', () => {
    const geometry = resolveRiverLanes(
      input([
        message('a', 'mia', 0),
        message('b', 'sarah', 1),
        message('c', 'tom', 2),
        notice('j', 'mia', 3),
      ]),
    );

    expect(laneOf(geometry, 'mia').spans[0].nodes).toEqual([
      { rank: 0, kind: 'bubble', messageId: 'a' },
    ]);
  });

  it('ne fait reparaître personne quand on répond à une annonce, et ne trace aucun connecteur vers elle', () => {
    const geometry = resolveRiverLanes(
      input([
        message('a', 'mia', 0),
        notice('j', 'lena', 1),
        message('b', 'sarah', 2, 'j'),
        message('c', 'tom', 3),
      ]),
    );

    expect(geometry.lanes.map((lane) => lane.laneId)).toEqual(['mia', 'sarah', 'tom']);
    expect(geometry.connectors).toEqual([]);
  });

  it('descend malgré tout l’axe du TEMPS — l’avis garde son rang, et se dit avis', () => {
    const geometry = resolveRiverLanes(
      input([message('a', 'mia', 0), notice('j', 'lena', 1), message('b', 'sarah', 2)]),
    );

    expect(geometry.rankCount).toBe(3);
    expect(geometry.bubbles.map((bubble) => [bubble.messageId, bubble.isSystem])).toEqual([
      ['a', false],
      ['j', true],
      ['b', false],
    ]);
  });

  it('ne nomme aucune colonne au rang d’une annonce — elle n’occupe la colonne de personne', () => {
    const geometry = resolveRiverLanes(
      input([message('a', 'mia', 0), notice('j', 'lena', 1), message('b', 'lena', 2)]),
    );

    expect(geometry.layout).toBe('serialized');
    expect(resolveRiverLaneHeaders({ geometry, focusRank: 1 })).toEqual([]);
  });
});

describe('resolveRiverLaneAt — une colonne partagée dit QUI l’occupe à cette hauteur', () => {
  const shared = resolveRiverLanes(crowd(10, (index) => index * (SILENCE_MINUTES + 5)));

  it('rend l’occupant vivant du moment, jamais le premier venu de la colonne', () => {
    expect(resolveRiverLaneAt(shared, 0, 0)?.laneId).toBe('p0');
    expect(resolveRiverLaneAt(shared, 0, 4)?.laneId).toBe('p4');
    expect(resolveRiverLaneAt(shared, 0, 9)?.laneId).toBe('p9');
  });

  it('ne rend personne sur une colonne éteinte à cette hauteur', () => {
    const geometry = resolveRiverLanes(
      input([
        message('a', 'mia', 0),
        message('b', 'sarah', 1),
        message('c', 'tom', SILENCE_MINUTES + 5),
      ]),
    );

    expect(resolveRiverLaneAt(geometry, laneOf(geometry, 'mia').laneIndex, 2)).toBeNull();
    expect(resolveRiverLaneAt(geometry, 42, 0)).toBeNull();
  });

  it('sérialisée, la colonne unique appartient à l’auteur du rang', () => {
    const geometry = resolveRiverLanes(input([message('a', 'mia', 0), message('b', 'sarah', 1)]));

    expect(resolveRiverLaneAt(geometry, 0, 0)?.laneId).toBe('mia');
    expect(resolveRiverLaneAt(geometry, 0, 1)?.laneId).toBe('sarah');
    expect(resolveRiverLaneAt(geometry, 1, 0)).toBeNull();
  });

  it('sérialisée, ne nomme AUCUNE colonne au rang d’une annonce — même quand l’arrivant parlera ensuite', () => {
    const geometry = resolveRiverLanes(
      input([notice('j', 'lena', 0), message('a', 'lena', 1), message('b', 'mia', 2)]),
    );

    expect(geometry.layout).toBe('serialized');
    expect(resolveRiverLaneAt(geometry, 0, 0)).toBeNull();
    expect(resolveRiverLaneAt(geometry, 0, 1)?.laneId).toBe('lena');
    expect(resolveRiverLaneAt(geometry, 0, 2)?.laneId).toBe('mia');
  });
});

describe('resolveRiverLaneHeaders — le nom en tête suit la ligne qu’on lit', () => {
  const braid = resolveRiverLanes(
    input([
      message('a', 'mia', 0),
      message('b', 'sarah', 1),
      message('c', 'tom', 2),
      message('d', 'sarah', 3),
    ]),
  );

  const headerOf = (focusRank: number, laneId: string): number | undefined =>
    resolveRiverLaneHeaders({ geometry: braid, focusRank }).find(
      (header) => header.laneId === laneId,
    )?.alpha;

  it('nomme chaque colonne vivante à la hauteur lue, en ordre de colonne', () => {
    const headers = resolveRiverLaneHeaders({ geometry: braid, focusRank: 3 });

    expect(headers.map((header) => header.laneId)).toEqual(['mia', 'sarah', 'tom']);
    expect(headers.map((header) => header.laneIndex)).toEqual([0, 1, 2]);
  });

  it('allume le nom sur ses premiers rangs plutôt que de le faire surgir opaque', () => {
    expect(headerOf(2, 'tom')).toBeCloseTo(0.5, 5);
    expect(headerOf(3, 'tom')).toBeCloseTo(1, 5);
  });

  it('ne rend AUCUN nom pour une branche qui n’est pas née', () => {
    expect(headerOf(0, 'tom')).toBeUndefined();
    expect(headerOf(1, 'tom')).toBeUndefined();
  });

  it('interpole sur un rang fractionnaire — le fondu suit le défilement, pas les rangs', () => {
    const alpha = headerOf(2.5, 'tom');

    expect(alpha).toBeGreaterThan(headerOf(2, 'tom') ?? 0);
    expect(alpha).toBeLessThan(1);
  });

  it('n’éteint jamais le nom d’une branche encore vivante au bas de la fenêtre', () => {
    const headers = resolveRiverLaneHeaders({ geometry: braid, focusRank: 3 });

    expect(headers.find((header) => header.laneId === 'sarah')?.alpha).toBe(1);
  });

  it('passe le relais en fondu croisé quand deux voix se succèdent d’un rang à l’autre', () => {
    const shared = resolveRiverLanes(crowd(10, (index) => index * (SILENCE_MINUTES + 5)));
    const relay = resolveRiverLaneHeaders({ geometry: shared, focusRank: 3.5 });

    expect(shared.laneCount).toBe(1);
    expect(relay.map((header) => header.laneId)).toEqual(['p3', 'p4']);
    // Un relais, pas deux présences : aucun des deux noms ne s’impose.
    expect(relay.every((header) => header.alpha < 1)).toBe(true);
  });

  it('ne nomme AUCUNE voix sur les rangs où la colonne est éteinte', () => {
    // Mia parle, meurt (silence franchi), Sarah et Tom occupent l’intervalle,
    // Mia renaît. Sur les rangs 1 et 2, sa colonne existe mais n’a personne.
    const reborn = resolveRiverLanes(
      input([
        message('a', 'mia', 0),
        message('b', 'sarah', SILENCE_MINUTES + 10),
        message('c', 'tom', SILENCE_MINUTES + 11),
        message('d', 'mia', 4 * SILENCE_MINUTES),
      ]),
    );
    const miaLane = laneOf(reborn, 'mia').laneIndex;
    const nameAt = (focusRank: number): readonly string[] =>
      resolveRiverLaneHeaders({ geometry: reborn, focusRank })
        .filter((header) => header.laneIndex === miaLane)
        .map((header) => header.laneId);

    expect(nameAt(0)).toEqual(['mia']);
    expect(nameAt(1)).toEqual([]);
    expect(nameAt(1.5)).toEqual([]);
    expect(nameAt(3)).toEqual(['mia']);
  });

  it('sérialisée, le nom traverse en fondu croisé : les groupes se touchent', () => {
    const geometry = resolveRiverLanes(input([message('a', 'mia', 0), message('b', 'sarah', 1)]));
    const crossing = resolveRiverLaneHeaders({ geometry, focusRank: 0.5 });

    expect(geometry.layout).toBe('serialized');
    expect([...crossing.map((header) => header.laneId)].sort()).toEqual(['mia', 'sarah']);
    expect(crossing.every((header) => header.alpha < 1)).toBe(true);
  });

  it('accepte une fenêtre de fondu fournie par l’appelant, sans réécrire la loi', () => {
    const instant = resolveRiverLaneHeaders({ geometry: braid, focusRank: 2, fadeRanks: 0 });

    expect(instant.find((header) => header.laneId === 'tom')?.alpha).toBe(1);
  });

  it('éteint tous les noms au-delà du dernier rang — hors fenêtre, il n’y a rien à nommer', () => {
    expect(resolveRiverLaneHeaders({ geometry: braid, focusRank: 99 })).toEqual([]);
    // Et jusqu’au dernier rang, une branche ouverte reste pleinement nommée.
    expect(
      resolveRiverLaneHeaders({ geometry: braid, focusRank: braid.rankCount - 1 }).every(
        (header) => header.alpha === 1,
      ),
    ).toBe(true);
  });
});

describe('resolveRiverStep — sérialisée, la rivière EST le fil', () => {
  const thread = resolveRiverLanes(input([message('a', 'mia', 0), message('b', 'sarah', 1)]));

  it('n’a plus d’axe horizontal à parcourir', () => {
    expect(
      resolveRiverStep({ geometry: thread, cursor: { laneIndex: 0, rank: 0 }, direction: 'right' }),
    ).toEqual({ cursor: { laneIndex: 0, rank: 0 }, reason: 'edge' });
  });

  it('descend au message suivant, quel qu’en soit l’auteur', () => {
    expect(
      resolveRiverStep({ geometry: thread, cursor: { laneIndex: 0, rank: 0 }, direction: 'down' }),
    ).toEqual({ cursor: { laneIndex: 0, rank: 1 }, reason: 'moved' });
  });

  it('s’arrête au bout du fil', () => {
    expect(
      resolveRiverStep({ geometry: thread, cursor: { laneIndex: 0, rank: 1 }, direction: 'down' }),
    ).toEqual({ cursor: { laneIndex: 0, rank: 1 }, reason: 'edge' });
  });

  it('ne connaît qu’un couloir vivant, sur tout rang de la fenêtre', () => {
    expect(resolveRiverLivingLanes(thread, 0)).toEqual([0]);
    expect(resolveRiverLivingLanes(thread, 1)).toEqual([0]);
    expect(resolveRiverLivingLanes(thread, 2)).toEqual([]);
  });
});

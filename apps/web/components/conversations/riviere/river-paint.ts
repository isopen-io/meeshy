/**
 * `river-paint.ts` — le tracé des branches et des connecteurs, ARITHMÉTIQUE
 * PURE (R-134, miroir web de `RiverLaneCanvas.swift`/de la fonction `paint()`
 * de la maquette normative).
 *
 * **Ne calcule AUCUNE géométrie de couloir/rang** (garde R15) : elle lit
 * `RiverGeometry` (la loi, `resolveRiverLanes`) et les EXTENTS MESURÉS des
 * bulles (`rowExtents`, publiés par `RiverThread` après mesure DOM réelle —
 * §7ter A1, « la peau mesure le rendu réel ») — jamais une hauteur de rang
 * supposée. `railX`/`resolveBow` sont INJECTÉS par l'appelant : ce fichier ne
 * lit ni CSS ni DOM lui-même, ce qui le rend testable sans monter un
 * composant (RED direct sur `resolveRiverLanes()` + extents fabriqués).
 *
 * **Reduce motion** : cette fonction ne produit AUCUNE information
 * d'animation (pas de durée, pas de trigger) — le composant qui la consomme
 * (`RiverLaneOverlay`) ne pose donc jamais de transition CSS non plus. Un
 * tracé qui apparaît/disparaît (nouvelle géométrie ⇒ nouveau paint) le fait
 * donc déjà sans mouvement, satisfaisant §7bis par construction plutôt que
 * par une branche conditionnelle à maintenir (même choix que
 * `RiverLaneCanvas.swift`, documenté là-bas).
 *
 * Décorative — la peau qui la consomme est `aria-hidden`. L'ordre
 * chronologique du contenu (`geometry.bubbles`, celui du DOM/VoiceOver côté
 * `RiverThread`) est ce qui prime ; les traits ne portent aucune information
 * que le contenu ne porte déjà.
 */

import type { RiverGeometry } from '@meeshy/shared/utils/river-lanes';
import { colorForName } from '@meeshy/shared/utils/conversation-colors';

export interface RiverRowExtent {
  readonly top: number;
  readonly bottom: number;
}

export interface RiverConnectorPaint {
  readonly key: string;
  readonly d: string;
  readonly color: string;
  readonly opacity: number;
}

export interface RiverSpanLinePaint {
  readonly key: string;
  readonly x: number;
  readonly y1: number;
  readonly y2: number;
  readonly color: string;
}

export interface RiverSpanTailPaint {
  readonly key: string;
  readonly gradientId: string;
  readonly x: number;
  readonly y1: number;
  readonly y2: number;
  readonly startColor: string;
  readonly startOpacity: number;
  readonly endColor: string;
  readonly endOpacity: number;
}

export interface RiverBirthDotPaint {
  readonly key: string;
  readonly cx: number;
  readonly cy: number;
  readonly color: string;
}

export interface RiverAddressedRingPaint {
  readonly key: string;
  readonly cx: number;
  readonly cy: number;
  readonly color: string;
}

export interface RiverPaint {
  readonly connectors: readonly RiverConnectorPaint[];
  readonly lines: readonly RiverSpanLinePaint[];
  readonly tails: readonly RiverSpanTailPaint[];
  readonly births: readonly RiverBirthDotPaint[];
  readonly rings: readonly RiverAddressedRingPaint[];
}

const EMPTY_PAINT: RiverPaint = { connectors: [], lines: [], tails: [], births: [], rings: [] };

/**
 * Une réponse lointaine (> ce nombre de rangs) s'estompe davantage — elle
 * remonte le fil, elle ne doit pas dominer le tracé des branches. Constante
 * de PEAU (rendu décoratif), pas de loi — mot pour mot la maquette normative
 * et `RiverLaneCanvas.swift` (`abs(...) > 4`).
 */
const FAR_REPLY_RANK_DISTANCE = 4;

const MAIN_LINE_OPACITY = 0.85;
const NEAR_CONNECTOR_OPACITY = 0.5;
const FAR_CONNECTOR_OPACITY = 0.3;
const OPEN_TAIL_END_OPACITY = 0.6;
const DEAD_TAIL_END_OPACITY = 0;
/** Amorce sous un nœud `addressed` seul, sans bulle propre — mot pour mot la maquette. */
const ADDRESSED_ONLY_TAIL_PX = 9;
const ROW_TOP_INSET_PX = 2;
const ROW_BOTTOM_INSET_PX = 4;

export interface BuildRiverPaintInput {
  readonly geometry: RiverGeometry;
  readonly rowExtents: ReadonlyMap<number, RiverRowExtent>;
  /** Axe X du rail d'un couloir — mesuré par l'appelant (`RiverThread`), jamais recalculé ici. */
  readonly railX: (laneIndex: number) => number;
  /** `river.connector.minBow`/`bowRatio` — lus par l'appelant (`connectorBow`, `river-metrics.ts`). */
  readonly resolveBow: (laneDistancePx: number) => number;
  /** Préfixe des identifiants de dégradé SVG — évite une collision entre deux Rivières montées côte à côte. */
  readonly idPrefix: string;
}

export function buildRiverPaint(input: BuildRiverPaintInput): RiverPaint {
  const { geometry, rowExtents, railX, resolveBow, idPrefix } = input;

  // Sérialisée : AUCUN trait — le verdict de la loi a retiré l'axe horizontal
  // (§7ter C). Les tracer quand même — même empilés dans l'unique colonne —
  // affirmerait un axe que la loi vient de nier. Le contour de chaque bulle
  // suffit à dire qui parle.
  if (geometry.layout === 'serialized') {
    return EMPTY_PAINT;
  }

  const bubbleByRank = new Map(geometry.bubbles.map((bubble) => [bubble.rank, bubble] as const));

  const connectors: RiverConnectorPaint[] = geometry.connectors.flatMap((connector) => {
    const fromExtent = rowExtents.get(connector.fromRank);
    const toExtent = rowExtents.get(connector.toRank);
    const toBubble = bubbleByRank.get(connector.toRank);
    if (!fromExtent || !toExtent || !toBubble) return [];

    const fx = railX(connector.fromLaneIndex);
    const tx = railX(connector.toLaneIndex);
    const fy = (fromExtent.top + fromExtent.bottom) / 2;
    const ty = (toExtent.top + toExtent.bottom) / 2;
    const side = tx >= fx ? 1 : -1;
    const bow = resolveBow(tx - fx);
    const lane = geometry.lanes.find((candidate) => candidate.laneId === toBubble.laneId);
    const color = colorForName(lane?.colorSeed ?? toBubble.laneId);
    const far = Math.abs(connector.toRank - connector.fromRank) > FAR_REPLY_RANK_DISTANCE;

    return [
      {
        key: `${connector.fromMessageId}->${connector.toMessageId}`,
        d: `M ${fx} ${fy} C ${fx + side * bow} ${fy} ${tx - side * bow} ${ty} ${tx} ${ty}`,
        color,
        opacity: far ? FAR_CONNECTOR_OPACITY : NEAR_CONNECTOR_OPACITY,
      },
    ];
  });

  const lines: RiverSpanLinePaint[] = [];
  const tails: RiverSpanTailPaint[] = [];
  const births: RiverBirthDotPaint[] = [];
  const rings: RiverAddressedRingPaint[] = [];

  geometry.lanes.forEach((lane) => {
    const cx = railX(lane.laneIndex);
    const color = colorForName(lane.colorSeed);

    lane.spans.forEach((span, spanIndex) => {
      const topExtent = rowExtents.get(span.startRank);
      const endExtent = rowExtents.get(span.endRank);
      if (!topExtent || !endExtent) return;

      const bubbleRanksInSpan = span.nodes
        .filter((node) => node.kind === 'bubble')
        .map((node) => node.rank);
      const lastNode = span.nodes[span.nodes.length - 1];

      let liveTo: number | undefined;
      if (bubbleRanksInSpan.length > 0) {
        const lastBubbleExtent = rowExtents.get(Math.max(...bubbleRanksInSpan));
        liveTo = lastBubbleExtent?.bottom;
      } else if (lastNode !== undefined) {
        // Segment SANS bulle propre (branche reparue pour recevoir une
        // réponse, `addressed` seul) — amorce courte sous son nœud.
        const anchorExtent = rowExtents.get(lastNode.rank);
        liveTo = anchorExtent
          ? (anchorExtent.top + anchorExtent.bottom) / 2 + ADDRESSED_ONLY_TAIL_PX
          : undefined;
      }
      if (liveTo === undefined) return;

      const top = topExtent.top + ROW_TOP_INSET_PX;
      const end = endExtent.bottom - ROW_BOTTOM_INSET_PX;
      const key = `${lane.laneId}-${spanIndex}`;

      if (liveTo > top) {
        lines.push({ key, x: cx, y1: top, y2: liveTo, color });
      }

      // Une branche qui MEURT s'estompe : c'est une disparition, pas une
      // coupure nette.
      if (end > liveTo) {
        tails.push({
          key,
          gradientId: `${idPrefix}-fade-${lane.laneIndex}-${spanIndex}`,
          x: cx,
          y1: liveTo,
          y2: end,
          startColor: color,
          startOpacity: MAIN_LINE_OPACITY,
          endColor: color,
          endOpacity: span.isOpen ? OPEN_TAIL_END_OPACITY : DEAD_TAIL_END_OPACITY,
        });
      }

      // Naissance — une amorce pleine, pour qu'on voie la branche APPARAÎTRE.
      births.push({ key, cx, cy: top, color });

      // Nœuds `addressed` — reparue pour recevoir une réponse : anneau creux,
      // AUCUNE bulle.
      span.nodes.forEach((node) => {
        if (node.kind !== 'addressed') return;
        const nodeExtent = rowExtents.get(node.rank);
        if (!nodeExtent) return;
        rings.push({
          key: `${key}-${node.messageId}`,
          cx,
          cy: (nodeExtent.top + nodeExtent.bottom) / 2,
          color,
        });
      });
    });
  });

  return { connectors, lines, tails, births, rings };
}

/**
 * Vecteurs inter-plateformes pour `resolveRiverLanes`
 * (`packages/shared/utils/river-lanes.ts`, R-130 + amendement R2).
 *
 * Fixtures : `packages/shared/fixtures/reading-modes/river-lanes.vectors.json`,
 * générées en EXÉCUTANT la loi (C-023) — jamais à la main. Les miroirs
 * plateforme (Swift `RiverLaneResolver`, R-132 ; Kotlin en phase 2) rejouent
 * CE fichier : la rivière de deux appareils différents est la même rivière ou
 * n'est pas.
 *
 * Les témoins ci-dessous existent parce qu'un jeu de vecteurs amputé passerait
 * au vert en ne prouvant plus rien (leçon 257 : jamais de vert silencieux).
 * Ce que la Rivière doit prouver ICI : les branches naissent, courent, meurent,
 * renaissent — et gardent leur colonne.
 */
import { describe, expect, it } from 'vitest';
import {
  resolveRiverLanes,
  type ResolveRiverLanesInput,
  type RiverGeometry,
} from '../../utils/river-lanes.js';
import { loadVectors, runVectors } from './harness.js';

runVectors<ResolveRiverLanesInput, RiverGeometry>('river-lanes', resolveRiverLanes);

const vectors = loadVectors<ResolveRiverLanesInput, RiverGeometry>('river-lanes');
const geometries = vectors.map((vector) => vector.expected);
const allSpans = geometries.flatMap((geometry) => geometry.lanes.flatMap((lane) => lane.spans));

describe('vectors: river-lanes — couverture du cycle de vie des branches', () => {
  it('exerce la rivière vide ET une rivière large (≥ 4 branches)', () => {
    expect(geometries.some((geometry) => geometry.laneCount === 0)).toBe(true);
    expect(geometries.some((geometry) => geometry.laneCount >= 4)).toBe(true);
  });

  it('exerce une branche qui MEURT puis RENAÎT — plusieurs segments dans une colonne', () => {
    const reborn = geometries.flatMap((geometry) =>
      geometry.lanes.filter((lane) => lane.spans.length > 1),
    );
    expect(reborn.length).toBeGreaterThan(0);
  });

  it('exerce les deux fins de segment : éteint (`isOpen: false`) et encore vivant en bas de fenêtre', () => {
    expect(allSpans.some((span) => span.isOpen === false)).toBe(true);
    expect(allSpans.some((span) => span.isOpen === true)).toBe(true);
  });

  it('exerce les deux natures de nœud : la bulle contournée et l’interpellation sans bulle', () => {
    const kinds = new Set(allSpans.flatMap((span) => span.nodes).map((node) => node.kind));
    expect(kinds).toEqual(new Set(['bubble', 'addressed']));
  });

  it('exerce une branche qui COURT au-delà de ses propres bulles', () => {
    const running = allSpans.filter((span) => span.endRank > span.startRank && span.nodes.length === 1);
    expect(running.length).toBeGreaterThan(0);
  });

  it('exerce un connecteur croisé ET une réponse dont la cible est hors fenêtre', () => {
    expect(
      geometries.some((geometry) =>
        geometry.connectors.some((connector) => connector.fromLaneIndex !== connector.toLaneIndex),
      ),
    ).toBe(true);
    expect(
      geometries.some(
        (geometry) =>
          geometry.connectors.length === 0 &&
          geometry.bubbles.some((bubble) => bubble.replyToMessageId !== null),
      ),
    ).toBe(true);
  });

  it('exerce la rive : le lecteur tient la colonne 0 sans être le premier à parler', () => {
    const lateViewer = geometries.filter((geometry) => {
      const viewerLane = geometry.lanes.find((lane) => lane.isViewer);
      const firstBubble = geometry.bubbles[0];
      return (
        viewerLane !== undefined &&
        firstBubble !== undefined &&
        firstBubble.laneId !== viewerLane.laneId
      );
    });

    expect(lateViewer.length).toBeGreaterThan(0);
    lateViewer.forEach((geometry) => {
      expect(geometry.lanes.find((lane) => lane.isViewer)?.laneIndex).toBe(0);
    });
  });

  it('tient l’invariant d’accessibilité : les bulles sont toujours servies dans l’ordre chronologique', () => {
    geometries.forEach((geometry) => {
      const ranks = geometry.bubbles.map((bubble) => bubble.rank);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      expect(geometry.bubbles.length).toBe(geometry.rankCount);
    });
  });

  it('tient l’invariant de colonne : 0..laneCount-1, sans trou, jamais plus large que la borne', () => {
    geometries.forEach((geometry) => {
      const columns = [...new Set(geometry.lanes.map((lane) => lane.laneIndex))].sort(
        (a, b) => a - b,
      );

      expect(columns).toEqual(columns.map((_unused, index) => index));
      expect(geometry.laneCount).toBe(columns.length);
      expect(geometry.laneCount).toBeLessThanOrEqual(geometry.maxLanes);
    });
  });

  it('tient l’invariant du partage : deux voix d’une même colonne ne parlent JAMAIS en même temps', () => {
    geometries
      .filter((geometry) => geometry.layout === 'lanes')
      .forEach((geometry) => {
        geometry.lanes.forEach((lane) => {
          const roommates = geometry.lanes.filter(
            (other) => other.laneIndex === lane.laneIndex && other.laneId !== lane.laneId,
          );
          roommates.forEach((other) => {
            lane.spans.forEach((span) => {
              other.spans.forEach((otherSpan) => {
                expect(span.startRank <= otherSpan.endRank && otherSpan.startRank <= span.endRank).toBe(
                  false,
                );
              });
            });
          });
        });
      });
  });

  it('exerce le partage de colonne : plus de voix que de couloirs, chacune à son tour', () => {
    const shared = geometries.filter(
      (geometry) => geometry.layout === 'lanes' && geometry.lanes.length > geometry.laneCount,
    );

    expect(shared.length).toBeGreaterThan(0);
  });

  it('exerce les deux verdicts de forme, et les DEUX causes de sérialisation', () => {
    const reasons = new Set(geometries.map((geometry) => geometry.serializationReason));

    expect(reasons).toEqual(new Set([null, 'belowMinimum', 'aboveMaximum']));
    expect(geometries.some((geometry) => geometry.laneCount === geometry.maxLanes)).toBe(true);
  });

  it('tient l’invariant de sérialisation : une seule colonne, pour tout le monde', () => {
    geometries
      .filter((geometry) => geometry.layout === 'serialized')
      .forEach((geometry) => {
        expect(geometry.lanes.every((lane) => lane.laneIndex === 0)).toBe(true);
        expect(geometry.bubbles.every((bubble) => bubble.laneIndex === 0)).toBe(true);
        expect(
          geometry.connectors.every(
            (connector) => connector.fromLaneIndex === 0 && connector.toLaneIndex === 0,
          ),
        ).toBe(true);
      });
  });

  it('exerce les deux natures de rangée : la tête de groupe qui porte l’identité, et la suite', () => {
    const heads = new Set(geometries.flatMap((g) => g.bubbles).map((bubble) => bubble.isFirstInGroup));

    expect(heads).toEqual(new Set([true, false]));
  });
});

/**
 * Un avis système descend l'axe du TEMPS avec les autres et n'entre dans aucun
 * des deux autres. Les vecteurs doivent l'EXERCER : sans ces témoins, un jeu
 * amputé de ses cas système repasserait au vert en ne prouvant plus la règle.
 */
describe('vectors: river-lanes — un avis système n’est la voix de personne', () => {
  const withNotices = geometries.filter((geometry) =>
    geometry.bubbles.some((bubble) => bubble.isSystem),
  );

  it('exerce au moins une fenêtre portant un avis système', () => {
    expect(withNotices.length).toBeGreaterThan(0);
  });

  it('ne lui donne ni voix, ni nœud de branche — il n’a que son rang', () => {
    withNotices.forEach((geometry) => {
      const nodeRanks = new Set(
        geometry.lanes
          .flatMap((lane) => lane.spans)
          .flatMap((span) => span.nodes)
          .map((node) => node.rank),
      );

      geometry.bubbles
        .filter((bubble) => bubble.isSystem)
        .forEach((systemBubble) => {
          expect(nodeRanks.has(systemBubble.rank)).toBe(false);
          expect(systemBubble.isFirstInGroup).toBe(true);
        });

      const spoken = geometry.bubbles.filter((bubble) => !bubble.isSystem);
      expect(geometry.voiceCount).toBe(new Set(spoken.map((bubble) => bubble.laneId)).size);
    });
  });

  it('exerce l’arrivant qui parle ensuite : sa première bulle OUVRE son groupe, jamais celui de son annonce', () => {
    const firstWords = withNotices.flatMap((geometry) =>
      geometry.bubbles.filter((bubble, index) => {
        const previous = geometry.bubbles[index - 1];
        return (
          previous?.isSystem === true && previous.laneId === bubble.laneId && !bubble.isSystem
        );
      }),
    );

    expect(firstWords.length).toBeGreaterThan(0);
    firstWords.forEach((bubble) => expect(bubble.isFirstInGroup).toBe(true));
  });
});

/**
 * Unit tests for playback-segments util (playback-segments.ts)
 *
 * Fusionne les portions d'un audio ou d'une vidéo réellement consommées par un
 * participant. La somme des segments fusionnés donne la COUVERTURE UNIQUE,
 * distincte du temps d'écoute cumulé qui compte les replays : « 45 s uniques
 * sur 90 s, pour 120 s d'écoute » signifie que des passages ont été revus.
 *
 * @see docs/superpowers/specs/2026-07-24-media-views-enrichment-design.md
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  mergePlaybackSegments,
  coveredDurationMs,
  type PlaybackSegment,
} from '../../../utils/playback-segments';

const seg = (startMs: number, endMs: number): PlaybackSegment => ({ startMs, endMs });

describe('mergePlaybackSegments — fusion', () => {
  it('conserve deux segments disjoints', () => {
    expect(mergePlaybackSegments([seg(0, 100)], [seg(500, 600)]))
      .toEqual([seg(0, 100), seg(500, 600)]);
  });

  it('fusionne deux segments qui se chevauchent', () => {
    expect(mergePlaybackSegments([seg(0, 500)], [seg(300, 900)]))
      .toEqual([seg(0, 900)]);
  });

  // L'adjacence en temps MÉDIA ne dit rien du temps RÉEL : écouter la première
  // moitié, s'interrompre dix minutes, puis reprendre produit exactement ces
  // deux segments. Les fusionner effacerait l'interruption — or « a écouté
  // d'une traite » et « a écouté en deux fois » ne se valent pas.
  //
  // Corollaire : le CLIENT doit fusionner ses propres échantillons d'une même
  // session de lecture continue avant de rapporter, lui seul sachant qu'ils
  // n'étaient pas séparés dans le temps.
  it('NE fusionne PAS deux segments qui se touchent — écoute interrompue', () => {
    expect(mergePlaybackSegments([seg(0, 500)], [seg(500, 900)]))
      .toEqual([seg(0, 500), seg(500, 900)]);
  });

  it('le nombre de segments compte les écoutes ininterrompues', () => {
    const merged = mergePlaybackSegments([], [seg(0, 500), seg(500, 900), seg(2000, 2500)]);

    expect(merged).toHaveLength(3);
  });

  it('absorbe un segment entièrement contenu dans un autre', () => {
    expect(mergePlaybackSegments([seg(0, 1000)], [seg(200, 300)]))
      .toEqual([seg(0, 1000)]);
  });

  it('trie des entrées désordonnées', () => {
    expect(mergePlaybackSegments([], [seg(800, 900), seg(0, 100), seg(400, 500)]))
      .toEqual([seg(0, 100), seg(400, 500), seg(800, 900)]);
  });

  it('chaîne une cascade de chevauchements en un seul segment', () => {
    expect(mergePlaybackSegments([], [seg(0, 300), seg(200, 600), seg(500, 900)]))
      .toEqual([seg(0, 900)]);
  });
});

describe('mergePlaybackSegments — entrées invalides', () => {
  it('rejette un segment inversé', () => {
    expect(mergePlaybackSegments([], [seg(500, 100)])).toEqual([]);
  });

  it('rejette un segment de durée nulle', () => {
    expect(mergePlaybackSegments([], [seg(300, 300)])).toEqual([]);
  });

  it('rejette une borne négative', () => {
    expect(mergePlaybackSegments([], [seg(-100, 200)])).toEqual([]);
  });

  it('conserve les segments valides d\'un lot partiellement invalide', () => {
    expect(mergePlaybackSegments([], [seg(500, 100), seg(0, 200)]))
      .toEqual([seg(0, 200)]);
  });

  it('rend une liste vide sans rien à fusionner', () => {
    expect(mergePlaybackSegments([], [])).toEqual([]);
  });
});

describe('mergePlaybackSegments — plafonnement', () => {
  // Un utilisateur qui scrube frénétiquement produirait sans borne un document
  // qui enfle indéfiniment. Au-delà du plafond, on fusionne les voisins les plus
  // proches : la couverture est légèrement SUR-estimée (les écarts comblés
  // comptent comme vus), compromis assumé au profit d'une taille bornée.
  it('ne dépasse jamais le plafond demandé', () => {
    const many = Array.from({ length: 60 }, (_, i) => seg(i * 100, i * 100 + 10));

    const merged = mergePlaybackSegments([], many, { maxSegments: 10 });

    expect(merged).toHaveLength(10);
  });

  it('comble l\'écart le plus PETIT en premier', () => {
    // Écarts : 10ms entre A et B, 1000ms entre B et C. A et B doivent fusionner.
    const merged = mergePlaybackSegments(
      [],
      [seg(0, 100), seg(110, 200), seg(1200, 1300)],
      { maxSegments: 2 }
    );

    expect(merged).toEqual([seg(0, 200), seg(1200, 1300)]);
  });

  it('préserve les bornes extrêmes après plafonnement', () => {
    const many = Array.from({ length: 40 }, (_, i) => seg(i * 100, i * 100 + 10));

    const merged = mergePlaybackSegments([], many, { maxSegments: 5 });

    expect(merged[0].startMs).toBe(0);
    expect(merged[merged.length - 1].endMs).toBe(3910);
  });
});

describe('mergePlaybackSegments — idempotence', () => {
  it('refusionner un résultat déjà fusionné ne le change pas', () => {
    const once = mergePlaybackSegments([], [seg(0, 300), seg(200, 600), seg(900, 1000)]);

    expect(mergePlaybackSegments(once, [])).toEqual(once);
  });

  it('rapporter deux fois le même segment ne change rien', () => {
    const once = mergePlaybackSegments([], [seg(0, 500)]);

    expect(mergePlaybackSegments(once, [seg(0, 500)])).toEqual(once);
  });
});

describe('coveredDurationMs', () => {
  it('somme des segments disjoints', () => {
    expect(coveredDurationMs([seg(0, 100), seg(500, 700)])).toBe(300);
  });

  it('ne compte pas deux fois un passage revu', () => {
    // 0-500 écouté deux fois : la couverture unique reste 500 ms, alors que le
    // temps d'écoute cumulé vaudrait 1000 ms.
    const merged = mergePlaybackSegments([], [seg(0, 500), seg(0, 500)]);

    expect(coveredDurationMs(merged)).toBe(500);
  });

  it('vaut zéro sans segment', () => {
    expect(coveredDurationMs([])).toBe(0);
  });
});

/**
 * Unit tests pour la trace de lecture (playback-trace.ts).
 *
 * Ce que le client rapporte n'est pas une liste de portions parcourues mais une
 * TRACE : chronologique, motivée, une entrée par écoute réellement continue.
 * Le serveur l'accumule sans la trier ni la fusionner — écouter la fin puis
 * revenir au début doit rester lisible dans cet ordre.
 *
 * La couverture (quelles portions, sans doublon) s'en DÉDUIT ; elle n'est pas
 * stockée à part.
 *
 * @see docs/superpowers/specs/2026-07-24-media-views-enrichment-design.md
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  parsePlaybackTrace,
  appendPlaybackStretches,
  traceCoverage,
  MAX_TRACE_STRETCHES,
  type PlaybackStretch,
} from '../../../utils/playback-trace';

const st = (
  startMs: number,
  endMs: number,
  endedBy: PlaybackStretch['endedBy'] = 'pause'
): PlaybackStretch => ({ startMs, endMs, endedBy });

describe('parsePlaybackTrace — lecture défensive du Json?', () => {
  it('rend une trace vide pour null (colonne jamais écrite)', () => {
    expect(parsePlaybackTrace(null)).toEqual([]);
    expect(parsePlaybackTrace(undefined)).toEqual([]);
  });

  it('rend une trace vide pour une valeur qui n\'est pas un tableau', () => {
    expect(parsePlaybackTrace({ startMs: 0 })).toEqual([]);
    expect(parsePlaybackTrace('nope')).toEqual([]);
    expect(parsePlaybackTrace(42)).toEqual([]);
  });

  it('conserve les entrées valides et jette les autres', () => {
    const raw = [
      { startMs: 0, endMs: 500, endedBy: 'pause' },
      { startMs: 500, endMs: 400, endedBy: 'pause' }, // fin avant début
      { startMs: -10, endMs: 200, endedBy: 'pause' }, // position négative
      { startMs: 700, endMs: 900, endedBy: 'teleported' }, // motif inconnu
      null,
      { startMs: 900, endMs: 1200, endedBy: 'completed' },
    ];

    expect(parsePlaybackTrace(raw)).toEqual([
      st(0, 500, 'pause'),
      st(900, 1200, 'completed'),
    ]);
  });

  it('rejette les positions non finies', () => {
    const raw = [
      { startMs: Number.NaN, endMs: 500, endedBy: 'pause' },
      { startMs: 0, endMs: Number.POSITIVE_INFINITY, endedBy: 'pause' },
    ];
    expect(parsePlaybackTrace(raw)).toEqual([]);
  });

  it('ignore les champs surnuméraires plutôt que de rejeter l\'entrée', () => {
    // Un client d'une version ultérieure peut enrichir le rapport ; le serveur
    // n'a aucune raison de perdre l'écoute pour autant.
    const raw = [{ startMs: 0, endMs: 500, endedBy: 'pause', speed: 1.5 }];
    expect(parsePlaybackTrace(raw)).toEqual([st(0, 500, 'pause')]);
  });
});

describe('appendPlaybackStretches — accumulation', () => {
  it('ajoute à la suite sans trier par position', () => {
    // L'utilisateur a écouté la fin, puis est revenu au début.
    const trace = appendPlaybackStretches(
      [st(9000, 9500, 'seek')],
      [st(0, 400, 'pause')]
    );

    expect(trace).toEqual([st(9000, 9500, 'seek'), st(0, 400, 'pause')]);
  });

  it('ne fusionne pas deux écoutes jointives — l\'interruption compte', () => {
    const trace = appendPlaybackStretches([st(0, 500)], [st(500, 900)]);
    expect(trace).toHaveLength(2);
  });

  it('ne fusionne pas non plus deux écoutes qui se chevauchent', () => {
    // Réécouter un passage est une écoute de plus, pas la même prolongée.
    const trace = appendPlaybackStretches([st(0, 500)], [st(300, 900)]);
    expect(trace).toEqual([st(0, 500), st(300, 900)]);
  });

  it('filtre les entrantes invalides sans perdre les valides', () => {
    const trace = appendPlaybackStretches(
      [],
      [st(300, 300), st(0, 500), st(800, 200)]
    );
    expect(trace).toEqual([st(0, 500)]);
  });

  it('préserve le motif de fin de chaque écoute', () => {
    const trace = appendPlaybackStretches(
      [],
      [st(0, 500, 'seek'), st(500, 900, 'muted'), st(900, 1000, 'completed')]
    );
    expect(trace.map((s) => s.endedBy)).toEqual(['seek', 'muted', 'completed']);
  });
});

describe('appendPlaybackStretches — rejeu', () => {
  it('ne compte pas deux fois une écoute déjà connue', () => {
    // Une file d'attente hors-ligne peut re-poster le même rapport. Sans garde,
    // « 3 écoutes » deviendrait « 6 » à la première reprise de réseau.
    const first = appendPlaybackStretches([], [st(0, 500), st(500, 900)]);
    const replayed = appendPlaybackStretches(first, [st(0, 500), st(500, 900)]);

    expect(replayed).toEqual(first);
  });

  it('distingue deux écoutes identiques en positions mais de motifs différents', () => {
    const trace = appendPlaybackStretches(
      [st(0, 500, 'pause')],
      [st(0, 500, 'dismissed')]
    );
    expect(trace).toHaveLength(2);
  });

  it('dédoublonne aussi à l\'intérieur d\'un même rapport', () => {
    const trace = appendPlaybackStretches([], [st(0, 500), st(0, 500)]);
    expect(trace).toHaveLength(1);
  });
});

describe('appendPlaybackStretches — plafond', () => {
  it('laisse passer une trace sous le plafond', () => {
    const incoming = Array.from({ length: 10 }, (_, i) => st(i * 100, i * 100 + 50));
    expect(appendPlaybackStretches([], incoming)).toHaveLength(10);
  });

  it('plafonne un scrub frénétique', () => {
    const incoming = Array.from(
      { length: MAX_TRACE_STRETCHES + 40 },
      (_, i) => st(i * 100, i * 100 + 50)
    );
    expect(appendPlaybackStretches([], incoming)).toHaveLength(MAX_TRACE_STRETCHES);
  });

  it('sacrifie les écoutes les plus COURTES — jamais les plus longues', () => {
    // Perdre la couverture la plus faible possible : la trace saturée
    // sous-estime, elle n'invente jamais une écoute qui n'a pas eu lieu.
    const longues = Array.from({ length: MAX_TRACE_STRETCHES }, (_, i) =>
      st(i * 10_000, i * 10_000 + 5_000)
    );
    const courtes = Array.from({ length: 5 }, (_, i) =>
      st(2_000_000 + i * 100, 2_000_000 + i * 100 + 10)
    );

    const trace = appendPlaybackStretches(longues, courtes);

    expect(trace).toHaveLength(MAX_TRACE_STRETCHES);
    expect(trace.every((s) => s.endMs - s.startMs === 5_000)).toBe(true);
  });

  it('préserve l\'ordre chronologique des rescapées', () => {
    const longues = Array.from({ length: MAX_TRACE_STRETCHES }, (_, i) =>
      st(i * 10_000, i * 10_000 + 5_000)
    );
    const trace = appendPlaybackStretches(longues, [st(9_999_000, 9_999_010)]);

    const starts = trace.map((s) => s.startMs);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

describe('traceCoverage — la couverture se DÉDUIT de la trace', () => {
  it('réunit les passages qui se chevauchent', () => {
    expect(traceCoverage([st(0, 500), st(300, 900)])).toEqual([
      { startMs: 0, endMs: 900 },
    ]);
  });

  it('garde disjoints les passages qui ne se touchent pas', () => {
    expect(traceCoverage([st(0, 100), st(500, 600)])).toEqual([
      { startMs: 0, endMs: 100 },
      { startMs: 500, endMs: 600 },
    ]);
  });

  it('remet dans l\'ordre des positions ce que la trace donne dans l\'ordre du temps', () => {
    expect(traceCoverage([st(9000, 9500), st(0, 400)])).toEqual([
      { startMs: 0, endMs: 400 },
      { startMs: 9000, endMs: 9500 },
    ]);
  });

  it('ne compte qu\'une fois un passage réécouté', () => {
    const coverage = traceCoverage([st(0, 1000), st(200, 400), st(200, 400)]);
    expect(coverage).toEqual([{ startMs: 0, endMs: 1000 }]);
  });

  it('rend une couverture vide pour une trace vide', () => {
    expect(traceCoverage([])).toEqual([]);
  });
});

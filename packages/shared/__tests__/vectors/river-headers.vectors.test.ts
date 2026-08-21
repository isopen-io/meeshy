/**
 * Vecteurs inter-plateformes pour `resolveRiverLaneHeaders` — le nom en tête
 * d'un couloir et son opacité (amendement R3, directive produit du 2026-08-17 :
 * « les noms en tête doivent refléter les auteurs de la ligne — fading et
 * apparition du nom correspondant à la ligne affichée pendant le scroll »).
 *
 * Fixtures : `packages/shared/fixtures/reading-modes/river-headers.vectors.json`,
 * générées en EXÉCUTANT la loi (C-023). Chaque cas porte la conversation
 * ENTIÈRE (`input.lanes`) et la hauteur de lecture : le vecteur prouve la
 * CHAÎNE `resolveRiverLanes` → `resolveRiverLaneHeaders`, celle que les miroirs
 * plateforme doivent reproduire de bout en bout — sinon deux appareils
 * nommeraient différemment la même ligne.
 *
 * Témoins de couverture (leçon 257 : jamais de vert silencieux) : le fondu doit
 * être exercé dans ses TROIS régimes — allumage, plein régime, extinction — sur
 * un rang entier ET sur un rang fractionnaire, plus le relais entre deux voix
 * qui se succèdent dans une même colonne et le silence d'une colonne éteinte.
 */
import { describe, expect, it } from 'vitest';
import {
  resolveRiverLaneHeaders,
  resolveRiverLanes,
  type ResolveRiverLanesInput,
  type RiverLaneHeader,
} from '../../utils/river-lanes.js';
import { loadVectors, runVectors } from './harness.js';

type RiverHeadersVectorInput = {
  readonly lanes: ResolveRiverLanesInput;
  readonly focusRank: number;
  readonly fadeRanks?: number;
};

const headers = (input: RiverHeadersVectorInput): readonly RiverLaneHeader[] =>
  resolveRiverLaneHeaders({
    geometry: resolveRiverLanes(input.lanes),
    focusRank: input.focusRank,
    fadeRanks: input.fadeRanks,
  });

runVectors<RiverHeadersVectorInput, readonly RiverLaneHeader[]>('river-headers', headers);

const vectors = loadVectors<RiverHeadersVectorInput, readonly RiverLaneHeader[]>('river-headers');
const allHeaders = vectors.flatMap((vector) => vector.expected);

describe('vectors: river-headers — couverture du fondu des noms', () => {
  it('exerce les trois régimes du fondu : allumage, plein régime, et rien du tout', () => {
    expect(allHeaders.some((header) => header.alpha > 0 && header.alpha < 1)).toBe(true);
    expect(allHeaders.some((header) => header.alpha === 1)).toBe(true);
    expect(vectors.some((vector) => vector.expected.length === 0)).toBe(true);
  });

  it('exerce une hauteur de lecture FRACTIONNAIRE — le fondu suit le défilement, pas les rangs', () => {
    expect(vectors.some((vector) => !Number.isInteger(vector.input.focusRank))).toBe(true);
  });

  it('exerce le relais : deux voix nommées sur la MÊME colonne, aucune à plein régime', () => {
    const relays = vectors.filter((vector) => {
      const byColumn = vector.expected.filter((header) => header.laneIndex === 0);
      return byColumn.length > 1;
    });

    expect(relays.length).toBeGreaterThan(0);
    relays.forEach((vector) => {
      vector.expected.forEach((header) => expect(header.alpha).toBeLessThan(1));
    });
  });

  it('exerce une rivière SÉRIALISÉE, dont l’unique colonne change de nom en descendant', () => {
    const serialized = vectors.filter((vector) =>
      vector.expected.every((header) => header.laneIndex === 0),
    );

    expect(serialized.length).toBeGreaterThan(0);
  });

  it('n’émet JAMAIS un nom d’opacité nulle : un nom éteint ne se rend pas', () => {
    allHeaders.forEach((header) => {
      expect(header.alpha).toBeGreaterThan(0);
      expect(header.alpha).toBeLessThanOrEqual(1);
    });
  });

  it('sert les noms en ordre de colonne — l’en-tête se lit de gauche à droite', () => {
    vectors.forEach((vector) => {
      const columns = vector.expected.map((header) => header.laneIndex);
      expect(columns).toEqual([...columns].sort((a, b) => a - b));
    });
  });

  it('exerce un avis SYSTÈME : aucun nom à son rang, et le nom revient au rang de la parole qui suit', () => {
    const withNotice = vectors.filter((vector) =>
      vector.input.lanes.messages.some((message) => message.isSystem === true),
    );

    expect(withNotice.length).toBeGreaterThan(0);
    expect(withNotice.some((vector) => vector.expected.length === 0)).toBe(true);
    expect(withNotice.some((vector) => vector.expected.length > 0)).toBe(true);
  });

  it('nomme la graine de couleur, jamais une couleur — la peau la calcule', () => {
    allHeaders.forEach((header) => {
      expect(header.colorSeed).not.toMatch(/^#/);
    });
  });
});

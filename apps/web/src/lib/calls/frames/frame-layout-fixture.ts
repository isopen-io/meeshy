import { frameSlots, type FrameLayoutInput } from './frame-layout';
import { FRAME_ARRANGEMENTS, type FrameLook } from './frame-spec';

/**
 * **LA FIXTURE DE PARITÉ DE LA GÉOMÉTRIE** (#8741) — ce que `frameSlots`
 * rend pour chaque disposition × nombre (2 à 7, et 12) × orientation × deux
 * jeux de paramètres représentatifs, arrondi au centième. Elle est écrite dans
 * `packages/shared/design/call-capture-frames-layout.fixture.json` par
 * `scripts/generate-frame-layout-fixture.ts` ; un témoin web exige qu'elle
 * soit à jour, et iOS compare son port à elle, case par case.
 */

export const FIXTURE_PEOPLE = [2, 3, 4, 5, 6, 7, 12] as const;
export const FIXTURE_SIZES = [
  { width: 1080, height: 1920 },
  { width: 1920, height: 1080 },
] as const;

type Params = { readonly name: string; readonly layout: Omit<FrameLook['layout'], 'arrangement'>; readonly slot: Pick<FrameLook['slot'], 'shape' | 'tilt'> };

export const FIXTURE_PARAMS: readonly Params[] = [
  { name: 'reserves', layout: { margin: 0.06, gap: 0.03, top: 0.18, bottom: 0.12 }, slot: { shape: 'round', tilt: 'none' } },
  { name: 'tilted', layout: { margin: 0.02, gap: 0.01, top: 0, bottom: 0.08 }, slot: { shape: 'rect', tilt: 'wild' } },
];

const round = (value: number): number => Math.round(value * 100) / 100 + 0;

export type LayoutFixtureCase = {
  readonly arrangement: string;
  readonly params: string;
  readonly people: number;
  readonly size: readonly [number, number];
  /** Une case par personne : `[x, y, largeur, hauteur, rotation en degrés]`, et sa forme. */
  readonly slots: readonly { readonly box: readonly [number, number, number, number, number]; readonly shape: string }[];
};

export type LayoutFixture = { readonly columns: readonly string[]; readonly cases: readonly LayoutFixtureCase[] };

export function layoutFixture(): LayoutFixture {
  const cases = FRAME_ARRANGEMENTS.flatMap((arrangement) =>
    FIXTURE_PARAMS.flatMap((params) =>
      FIXTURE_PEOPLE.flatMap((people) =>
        FIXTURE_SIZES.map((size) => {
          const input: FrameLayoutInput = { layout: { arrangement, ...params.layout }, slot: { ...params.slot, tone: 'color' } };
          return {
            arrangement,
            params: params.name,
            people,
            size: [size.width, size.height] as const,
            slots: frameSlots(input, people, size).map((slot) => ({ box: [round(slot.rect.x), round(slot.rect.y), round(slot.rect.width), round(slot.rect.height), round(slot.rotation)] as const, shape: slot.shape })),
          };
        }),
      ),
    ),
  );
  return { columns: ['x', 'y', 'width', 'height', 'rotation'], cases };
}

/** Le texte du fichier : une case par ligne, pour qu'un écart se lise dans un diff. */
export function layoutFixtureText(fixture: LayoutFixture = layoutFixture()): string {
  const cases = fixture.cases.map((entry) => {
    const slots = entry.slots.map((slot) => `        { "box": ${JSON.stringify(slot.box)}, "shape": ${JSON.stringify(slot.shape)} }`).join(',\n');
    return `    {\n      "arrangement": ${JSON.stringify(entry.arrangement)},\n      "params": ${JSON.stringify(entry.params)},\n      "people": ${entry.people},\n      "size": ${JSON.stringify(entry.size)},\n      "slots": [\n${slots}\n      ]\n    }`;
  });
  const params = JSON.stringify(FIXTURE_PARAMS);
  return `{\n  "generator": "apps/web/scripts/generate-frame-layout-fixture.ts",\n  "params": ${params},\n  "columns": ${JSON.stringify(fixture.columns)},\n  "cases": [\n${cases.join(',\n')}\n  ]\n}\n`;
}

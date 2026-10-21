import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as z from 'zod/mini';

import { FRAME_COSTS, FRAME_SURFACES } from '../../scripts/generate-call-frames-swift';
import { GLORY_FRAME_FONTS } from '../glory-frame-format';
import { PACK_LANGUAGES } from '../content-pack';
import {
  LENS_COSTS,
  LENS_LAYER_KINDS,
  LENS_LIMITS,
  LENS_SCHEMA_VERSION,
  LENS_SURFACES,
  LENS_TRIGGER_EVENTS,
  parseLens,
  type LensParseOutcome,
} from '../lens-format';

const VECTORS_FILE = join(__dirname, '../../fixtures/lens-v1/vectors.json');
const DOC_FILE = join(__dirname, '../../../../docs/product/meeshy-lens-v1.md');

const ExpectationSchema = z.union([
  z.object({
    status: z.literal('ok'),
    layerIds: z.array(z.string()),
    triggerCount: z.int(),
    ignoredLayers: z.int(),
    ignoredTriggers: z.int(),
  }),
  z.object({ status: z.literal('update-required'), schema: z.int() }),
  z.object({ status: z.literal('forbidden'), reasons: z.array(z.string()) }),
  z.object({ status: z.literal('invalid') }),
]);
const VectorsSchema = z.object({
  vectors: z.array(z.object({ name: z.string().check(z.minLength(1)), input: z.unknown(), expect: ExpectationSchema })),
});

const vectors = VectorsSchema.parse(JSON.parse(readFileSync(VECTORS_FILE, 'utf8'))).vectors;

const summarize = (outcome: LensParseOutcome): z.infer<typeof ExpectationSchema> => {
  switch (outcome.status) {
    case 'ok':
      return {
        status: 'ok',
        layerIds: outcome.lens.layers.map((layer) => layer.id),
        triggerCount: outcome.lens.triggers.length,
        ignoredLayers: outcome.ignoredLayers,
        ignoredTriggers: outcome.ignoredTriggers,
      };
    case 'update-required':
      return { status: 'update-required', schema: outcome.schema };
    case 'forbidden':
      return { status: 'forbidden', reasons: outcome.reasons };
    case 'invalid':
      return { status: 'invalid' };
  }
};

const baseLens = (): Record<string, unknown> => {
  const complete = vectors.find((vector) => vector.name === 'une lens complète est lue en entier');
  if (complete === undefined) throw new Error('vecteur de référence introuvable');
  return structuredClone(complete.input) as Record<string, unknown>;
};

describe('MeeshyLens v1 — les vecteurs partagés', () => {
  it('couvre chaque issue possible du contrat', () => {
    const statuses = new Set(vectors.map((vector) => vector.expect.status));
    expect([...statuses].sort()).toEqual(['forbidden', 'invalid', 'ok', 'update-required']);
    expect(vectors.length).toBeGreaterThan(40);
  });

  it.each(vectors.map((vector) => [vector.name, vector] as const))('%s', (_name, vector) => {
    expect(summarize(parseLens(vector.input))).toEqual(vector.expect);
  });
});

describe('MeeshyLens v1 — le contrat', () => {
  it('porte le schéma 1 et le dit', () => {
    expect(LENS_SCHEMA_VERSION).toBe(1);
  });

  it('plafonne à douze couches et huit déclencheurs', () => {
    expect(LENS_LIMITS.maxLayers).toBe(12);
    expect(LENS_LIMITS.maxTriggers).toBe(8);
  });

  it('ne connaît que les cinq primitives', () => {
    expect([...LENS_LAYER_KINDS]).toEqual(['lut', 'frame', 'sticker', 'text', 'particles']);
  });

  it('partage ses surfaces et ses coûts avec les cadres d\'appel (une seule liste)', () => {
    expect([...LENS_SURFACES]).toEqual([...FRAME_SURFACES]);
    expect([...LENS_COSTS]).toEqual([...FRAME_COSTS]);
  });

  it('lit la lens complète telle que le contrat la décrit', () => {
    const outcome = parseLens(baseLens());
    if (outcome.status !== 'ok') throw new Error(`attendu ok, reçu ${outcome.status}`);
    expect(outcome.lens).toMatchObject({
      schema: 1,
      id: 'aurore-polaire',
      credits: { author: 'Studio Nord', createdAt: '2026-10-01', updatedAt: '2026-10-12' },
      surfaces: ['capture', 'live'],
      cost: 'standard',
      window: { startsAt: '2026-12-01T00:00:00Z', endsAt: '2026-12-31T23:59:59Z', geo: { countries: ['FR', 'CA'] }, communities: ['64b7f0c2a1b2c3d4e5f60718'] },
      fallbacks: { reduced: { hide: ['neige'] }, minimal: { hide: ['neige', 'couronne'] } },
    });
    expect(outcome.lens.layers.map((layer) => layer.kind)).toEqual(['lut', 'frame', 'sticker', 'sticker', 'text', 'particles']);
    expect(outcome.lens.layers[2]).toMatchObject({ anchor: { type: 'face', point: 'top-of-head', dy: -0.1 } });
    expect(outcome.lens.layers[3]).toMatchObject({ anchor: { type: 'screen', x: 0.85, y: 0.12 } });
  });

  it('ne mute jamais son entrée', () => {
    const input = baseLens();
    const before = JSON.stringify(input);
    parseLens(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('utilise des polices de la liste fermée des cadres', () => {
    const outcome = parseLens(baseLens());
    if (outcome.status !== 'ok') throw new Error('attendu ok');
    const text = outcome.lens.layers.find((layer) => layer.kind === 'text');
    expect(GLORY_FRAME_FONTS as readonly string[]).toContain(text?.kind === 'text' ? text.font : '');
  });

  it('refuse une police hors liste en ignorant la couche', () => {
    const input = baseLens();
    const layers = input.layers as Record<string, unknown>[];
    layers[4] = { ...layers[4], font: 'Comic Sans' };
    const outcome = parseLens(input);
    expect(outcome.status === 'ok' && outcome.ignoredLayers).toBe(1);
  });

  it('refuse une langue de texte hors des sept (elle est ignorée, pas fatale)', () => {
    const input = baseLens();
    const layers = input.layers as Record<string, unknown>[];
    layers[4] = { ...layers[4], text: { fr: 'Salut', xx: 'Hola' } };
    const outcome = parseLens(input);
    if (outcome.status !== 'ok') throw new Error('attendu ok');
    const text = outcome.lens.layers.find((layer) => layer.kind === 'text');
    expect(text?.kind === 'text' ? Object.keys(text.text) : []).toEqual(['fr']);
    expect([...PACK_LANGUAGES]).toHaveLength(7);
  });

  it('garde le texte et le nom dans chacune des sept langues du Prisme', () => {
    const input = baseLens();
    const layers = input.layers as Record<string, unknown>[];
    const texts = Object.fromEntries(PACK_LANGUAGES.map((language) => [language, `texte ${language}`]));
    layers[4] = { ...layers[4], text: texts };
    input.names = Object.fromEntries(PACK_LANGUAGES.filter((language) => language !== 'fr').map((language) => [language, `nom ${language}`]));
    const outcome = parseLens(input);
    if (outcome.status !== 'ok') throw new Error('attendu ok');
    const text = outcome.lens.layers.find((layer) => layer.kind === 'text');
    expect(text?.kind === 'text' ? text.text : {}).toEqual(texts);
    expect(outcome.lens.names).toEqual(input.names);
  });

  it('chaque déclencheur de la liste fermée est lisible', () => {
    LENS_TRIGGER_EVENTS.forEach((on) => {
      const input = baseLens();
      input.triggers = [{ on, action: 'burst', target: 'neige' }];
      const outcome = parseLens(input);
      expect(outcome.status === 'ok' && outcome.lens.triggers.length).toBe(1);
    });
  });
});

describe('MeeshyLens v1 — la documentation', () => {
  const doc = readFileSync(DOC_FILE, 'utf8');

  it('nomme chaque primitive, chaque interdit et la règle de version', () => {
    [...LENS_LAYER_KINDS, 'shader', 'script', 'URL', 'réseau', '3D', 'mettre à jour', 'schema', 'vectors.json', 'generate:lens-format'].forEach((term) => {
      expect(doc, term).toContain(term);
    });
  });
});

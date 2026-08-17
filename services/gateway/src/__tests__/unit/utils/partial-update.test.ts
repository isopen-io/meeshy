/**
 * `submittedKeysOnly` — la réduction qui rend une fusion partielle réellement
 * partielle. Voir l'en-tête de `utils/partial-update` pour le piège Zod.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import { submittedKeysOnly } from '../../../utils/partial-update';

const Schema = z.object({
  a: z.boolean().default(true),
  b: z.boolean().default(true),
  c: z.string().default('x'),
});

describe('submittedKeysOnly', () => {
  it('le piège existe : `partial()` garnit le schéma entier de ses défauts', () => {
    expect(Schema.partial().parse({ b: false })).toEqual({ a: true, b: false, c: 'x' });
  });

  it('ne retient que les clés que le corps nomme', () => {
    const body = { b: false };
    expect(submittedKeysOnly(Schema.partial().parse(body), body)).toEqual({ b: false });
  });

  it('un corps vide ne retient rien', () => {
    expect(submittedKeysOnly(Schema.partial().parse({}), {})).toEqual({});
  });

  it('retient une valeur envoyée même quand elle COÏNCIDE avec le défaut', () => {
    const body = { a: true };
    expect(submittedKeysOnly(Schema.partial().parse(body), body)).toEqual({ a: true });
  });

  it('ne réintroduit pas une clé que Zod a écartée', () => {
    const body = { b: false, inconnue: 1 };
    expect(submittedKeysOnly(Schema.partial().parse(body), body)).toEqual({ b: false });
  });

  it('rend un objet vide pour un corps qui n\'est pas un objet', () => {
    const validated = { a: true, b: true, c: 'x' };
    expect(submittedKeysOnly(validated, null)).toEqual({});
    expect(submittedKeysOnly(validated, 'texte')).toEqual({});
    expect(submittedKeysOnly(validated, [1, 2])).toEqual({});
  });

  it('ne mute pas la valeur validée', () => {
    const validated = { a: true, b: false, c: 'x' };
    submittedKeysOnly(validated, { b: false });
    expect(validated).toEqual({ a: true, b: false, c: 'x' });
  });
});

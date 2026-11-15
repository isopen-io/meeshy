import { describe, expect, test } from 'bun:test';

import type { RegistryRow } from '@/lib/api/admin-packs-registry';

import { formOfRow, patchOfForm } from './packs-registry-form';
import { registryTextKeysOf } from './packs-registry-texts';

/**
 * W17 (#11323) — LE FORMULAIRE D'UNE SURCHARGE, loi pure : il part de l'entrée
 * SERVIE et rend le seul correctif, au format que la route valide
 * (`PackRegistryOverrideSchema`) : un prix vide RETIRE le prix (`null`), une
 * fenêtre vide la retire, une liste vide retire le ciblage. Une saisie hors des
 * lois du registre (ordre, prix, fenêtre inversée) est refusée AVANT le réseau.
 */
const row: RegistryRow = {
  domain: 'wallpaper',
  slug: 'aurore',
  origin: 'official',
  revision: 2,
  base: { hidden: false, order: 10, price: null, availability: null, targeting: null },
  overridden: false,
  effective: { hidden: false, order: 10, price: 30, availability: { startsAt: '2026-11-01T00:00:00.000Z' }, targeting: { countries: ['FR', 'BE'] } },
};

describe('formOfRow / patchOfForm', () => {
  test('le formulaire part de l’entrée servie, et la rend telle quelle', () => {
    const form = formOfRow(row);
    expect(form).toMatchObject({ order: '10', price: '30', startsAt: '2026-11-01T00:00', endsAt: '', countries: 'FR, BE', communities: '', languages: '' });
    expect(patchOfForm(form)).toEqual({ ok: true, patch: { order: 10, price: 30, availability: { startsAt: '2026-11-01T00:00:00.000Z' }, targeting: { countries: ['FR', 'BE'] } } });
  });

  test('vider le prix, la fenêtre et le ciblage les RETIRE (null)', () => {
    const form = { ...formOfRow(row), price: '', startsAt: '', countries: '' };
    expect(patchOfForm(form)).toEqual({ ok: true, patch: { order: 10, price: null, availability: null, targeting: null } });
  });

  test('une saisie hors des lois du registre est refusée avant le réseau', () => {
    expect(patchOfForm({ ...formOfRow(row), order: '-1' }).ok).toBe(false);
    expect(patchOfForm({ ...formOfRow(row), price: '0' }).ok).toBe(false);
    expect(patchOfForm({ ...formOfRow(row), price: '12.5' }).ok).toBe(false);
    expect(patchOfForm({ ...formOfRow(row), startsAt: '2026-11-02T00:00', endsAt: '2026-11-01T00:00' }).ok).toBe(false);
  });
});

describe('les textes du registre', () => {
  test('les quatre langues de l’administration portent les clés du français', () => {
    const source = [...registryTextKeysOf('fr')].sort();
    for (const language of ['en', 'es', 'pt'] as const) expect([...registryTextKeysOf(language)].sort()).toEqual(source);
  });
});

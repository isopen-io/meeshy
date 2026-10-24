import { describe, expect, test } from 'bun:test';

import { parseLens } from '@meeshy/shared/types/lens-format';

import { emptyLensDraft, lensDocumentOf, lensDraftAddresses, lensDraftFiles, lensDraftProblems, newDraftLayer, type DraftLayer, type LensDraft } from './lens-draft';
import { prepareLensSubmission, type Digest } from './submission';

/**
 * W16 (#11322) — COMPOSER UNE LENS SANS CODE : le brouillon que le partenaire
 * remplit devient un document MeeshyLens que `parseLens` lit et que la
 * préparation laisse partir. Tout ce qui se déduit se déduit : l'adresse vient
 * du nom, le coût est MESURÉ (jamais demandé), chaque couche reçoit son
 * identifiant, chaque fichier son adresse par contenu.
 */
const digest: Digest = async (bytes) => new TextDecoder().decode(bytes).padEnd(64, '0');

const png = (content: string, name = 'image.png'): File => new File([content], name, { type: 'image/png' });

const draftOf = (extra: Partial<LensDraft> = {}): LensDraft => ({ ...emptyLensDraft('2026-10-24'), name: 'Aurore Polaire', author: 'Studio Nord', ...extra });

const sticker = (file: File | null): DraftLayer => ({ key: 'l1', kind: 'sticker', file, place: 'forehead', size: 0.3 });

const textLayer = (text: string): DraftLayer => ({ key: 'l2', kind: 'text', text, font: 'Manrope', color: '#FFFFFF', size: 0.08, place: 'screen-bottom' });

const snow: DraftLayer = { key: 'l3', kind: 'particles', preset: 'snow', density: 'high' };

describe('newDraftLayer', () => {
  test('chaque couche naît déjà valide, sauf ce que seul le partenaire peut fournir', () => {
    expect(newDraftLayer('particles', 'k')).toEqual({ key: 'k', kind: 'particles', preset: 'sparkles', density: 'mid' });
    expect(newDraftLayer('sticker', 'k')).toMatchObject({ kind: 'sticker', file: null, place: 'screen-center' });
    expect(newDraftLayer('text', 'k')).toMatchObject({ kind: 'text', text: '', font: 'Manrope' });
    expect(newDraftLayer('lut', 'k')).toMatchObject({ kind: 'lut', file: null, intensity: 1 });
  });
});

describe('emptyLensDraft', () => {
  test('un brouillon neuf se joue partout, du jour même à trente jours', () => {
    const draft = emptyLensDraft('2026-10-24');
    expect(draft.surfaces).toEqual(['capture', 'live']);
    expect(draft.startsOn).toBe('2026-10-24');
    expect(draft.endsOn).toBe('2026-11-23');
    expect(draft.layers).toEqual([]);
  });
});

describe('lensDocumentOf', () => {
  test('le brouillon composé est une lens lisible, et la préparation la laisse partir avec son fichier', async () => {
    const crown = png('aaaaaaaaaaaaaaaa', 'couronne.png');
    const draft = draftOf({ layers: [sticker(crown), textLayer('Joyeux Noël'), snow] });
    const addresses = await lensDraftAddresses(draft, digest);
    const document = lensDocumentOf(draft, { addresses, today: '2026-10-24' });

    const parsed = parseLens(document);
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return;
    expect(parsed.lens.id).toBe('aurore-polaire');
    expect(parsed.lens.cost).toBe('standard');
    expect(parsed.lens.credits).toEqual({ author: 'Studio Nord', createdAt: '2026-10-24' });
    expect(parsed.lens.window).toEqual({ startsAt: '2026-10-24T00:00:00Z', endsAt: '2026-11-23T23:59:59Z' });
    expect(parsed.lens.layers.map((layer) => layer.kind)).toEqual(['sticker', 'text', 'particles']);
    expect(parsed.lens.layers[0]).toMatchObject({ asset: 'aaaaaaaaaaaaaaaa.png', anchor: { type: 'face', point: 'forehead' } });
    expect(parsed.lens.layers[1]).toMatchObject({ text: { fr: 'Joyeux Noël' }, anchor: { type: 'screen', x: 0.5 } });

    const prepared = await prepareLensSubmission({ documentText: JSON.stringify(document), files: lensDraftFiles(draft), digest });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(Object.keys(prepared.submission.assets)).toEqual(['aaaaaaaaaaaaaaaa.png']);
  });

  test('le coût est mesuré sur les couches, jamais demandé', async () => {
    const draft = draftOf({ layers: [textLayer('Bonjour')] });
    const document = lensDocumentOf(draft, { addresses: await lensDraftAddresses(draft, digest), today: '2026-10-24' });
    const parsed = parseLens(document);
    expect(parsed.status === 'ok' ? parsed.lens.cost : null).toBe('light');
  });
});

describe('lensDraftProblems', () => {
  test('un brouillon vide dit ce qui manque : un nom, une signature, une couche', () => {
    expect(lensDraftProblems({ ...emptyLensDraft('2026-10-24') })).toEqual(['name', 'author', 'layers']);
  });

  test('un sticker sans image, un texte vide, une fenêtre à l’envers, aucune surface : chacun se dit', () => {
    expect(lensDraftProblems(draftOf({ layers: [sticker(null)] }))).toEqual(['file']);
    expect(lensDraftProblems(draftOf({ layers: [textLayer('  ')] }))).toEqual(['text']);
    expect(lensDraftProblems(draftOf({ layers: [textLayer('Salut')], endsOn: '2026-10-20' }))).toEqual(['window']);
    expect(lensDraftProblems(draftOf({ layers: [textLayer('Salut')], surfaces: [] }))).toEqual(['surfaces']);
  });

  test('un brouillon complet n’a aucun problème', () => {
    expect(lensDraftProblems(draftOf({ layers: [sticker(png('aaaaaaaaaaaaaaaa'))] }))).toEqual([]);
  });
});

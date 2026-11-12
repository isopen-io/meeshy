import { describe, expect, test } from 'bun:test';

import { captureFrames } from './frame-catalogue';
import { baseIdOf, declinationsOf, framesFor, hidesBeyondSpotlight, moodsFor, reconcileFrame, scopeShowing, SPOTLIGHT, spotlightFrames, spotlightMoods } from './frame-filter';
import { createFrameStudio } from './frame-studio';
import { shelvedStudio } from './frame-shelf';
import type { CaptureFrame } from './frame-spec';

/**
 * **LA MISE EN AVANT ET LES DÉCLINAISONS DES CADRES** (#12692, #12685, #17821 C1.3 / C1.6) — jumelles de
 * `CallFrameSpotlightRule` et `CallFrameStyleRule` d'iOS. Les sept ambiances de `spotlight.json` s'ouvrent
 * d'office, leurs cadres vedettes dans leur ordre ; « Plus d'ambiances » rend tout le catalogue. Un cadre a
 * pour déclinaisons sa version de base puis chacune de ses `styles`, et leur identifiant porte celui du style.
 */

const frames = captureFrames();

describe('spotlightMoods — les ambiances ouvertes d’office', () => {
  test('sept ambiances, dans l’ordre de la mise en avant, quand elles servent n', () => {
    expect(SPOTLIGHT.map((entry) => entry.mood)).toEqual(['signature', 'jovial', 'feerique', 'futuriste', 'hors-norme', 'glauque', 'morbide']);
    expect(spotlightMoods(frames, 2, 'spotlight')).toEqual(SPOTLIGHT.map((entry) => entry.mood).filter((mood) => moodsFor(frames, 2).includes(mood)));
  });

  test('tout le catalogue : l’ordre canonique, exactement comme avant la mise en avant', () => {
    expect(spotlightMoods(frames, 2, 'all')).toEqual(moodsFor(frames, 2));
    expect(spotlightMoods(frames, 2, 'all').length).toBeGreaterThan(spotlightMoods(frames, 2, 'spotlight').length);
  });

  test('si aucune vedette ne sert n, tout ce qui sert n s’offre (jamais une rangée vide)', () => {
    expect(spotlightMoods(frames, 2, 'spotlight', [])).toEqual(moodsFor(frames, 2));
  });
});

describe('spotlightFrames — les vedettes d’une ambiance', () => {
  test('ses seules vedettes, dans leur ordre ; toute l’ambiance au catalogue entier', () => {
    const featured = SPOTLIGHT.find((entry) => entry.mood === 'morbide')?.featured ?? [];
    expect(spotlightFrames(frames, 2, 'morbide', 'spotlight').map((frame) => frame.motif)).toEqual(featured.filter((motif) => framesFor(frames, 2, 'morbide').some((frame) => frame.motif === motif)));
    expect(spotlightFrames(frames, 2, 'morbide', 'all')).toEqual(framesFor(frames, 2, 'morbide'));
  });

  test('aucune vedette ne sert n : toute l’ambiance', () => {
    expect(spotlightFrames(frames, 2, 'jovial', 'spotlight', [{ mood: 'jovial', featured: ['jovial.absent'] }])).toEqual(framesFor(frames, 2, 'jovial'));
  });
});

describe('hidesBeyondSpotlight — « Plus d’ambiances » n’existe que s’il révèle quelque chose', () => {
  const source = (people: number) => ({ moods: (scope: 'spotlight' | 'all') => spotlightMoods(frames, people, scope), framesOf: (mood: CaptureFrame['mood'], scope: 'spotlight' | 'all') => spotlightFrames(frames, people, mood, scope) });

  test('le catalogue entier cache des ambiances : la puce se propose', () => {
    expect(hidesBeyondSpotlight(source(2))).toBe(true);
  });

  test('une mise en avant qui montre tout ne propose rien', () => {
    const all = { moods: () => ['jovial' as const], framesOf: () => frames.slice(0, 2) };
    expect(hidesBeyondSpotlight(all)).toBe(false);
  });
});

describe('scopeShowing — le cadre choisi reste visible', () => {
  test('un cadre de la mise en avant garde la portée demandée', () => {
    const featured = spotlightFrames(frames, 2, 'jovial', 'spotlight')[0];
    expect(featured).toBeDefined();
    if (featured === undefined) return;
    const source = { moods: (scope: 'spotlight' | 'all') => spotlightMoods(frames, 2, scope), framesOf: (mood: CaptureFrame['mood'], scope: 'spotlight' | 'all') => spotlightFrames(frames, 2, mood, scope), find: (id: string) => frames.find((frame) => frame.id === baseIdOf(id)) ?? null };
    expect(scopeShowing(source, featured.id, 'spotlight')).toBe('spotlight');
    expect(scopeShowing(source, `${featured.id}.relief`, 'spotlight')).toBe('spotlight');
  });

  test('un cadre hors de la mise en avant ouvre tout le catalogue, pour que le choix en cours reste visible', () => {
    const hidden = framesFor(frames, 2).find((frame) => !spotlightFrames(frames, 2, frame.mood, 'spotlight').some((other) => other.id === frame.id));
    expect(hidden).toBeDefined();
    if (hidden === undefined) return;
    const source = { moods: (scope: 'spotlight' | 'all') => spotlightMoods(frames, 2, scope), framesOf: (mood: CaptureFrame['mood'], scope: 'spotlight' | 'all') => spotlightFrames(frames, 2, mood, scope), find: (id: string) => frames.find((frame) => frame.id === id) ?? null };
    expect(scopeShowing(source, hidden.id, 'spotlight')).toBe('all');
    expect(scopeShowing(source, hidden.id, 'all')).toBe('all');
  });

  test('aucun cadre choisi (les classiques) : la portée demandée', () => {
    const source = { moods: () => [], framesOf: () => [], find: () => null };
    expect(scopeShowing(source, null, 'spotlight')).toBe('spotlight');
  });
});

describe('les déclinaisons d’un cadre', () => {
  const styled = frames.find((frame) => (frame.styles?.length ?? 0) > 0);

  test('le catalogue a des cadres à déclinaisons (sinon rien de cela ne se voit)', () => {
    expect(styled).toBeDefined();
  });

  test('la base d’abord, puis chaque style : l’identifiant porte celui du style', () => {
    if (styled === undefined) return;
    const list = declinationsOf(styled);
    expect(list.map((frame) => frame.id)).toEqual([styled.id, ...(styled.styles ?? []).map((style) => `${styled.id}.${style.id}`)]);
    expect(list[0]).toBe(styled);
  });

  test('un cadre sans déclinaison n’en a qu’une : lui-même', () => {
    const plain = frames.find((frame) => (frame.styles?.length ?? 0) === 0);
    if (plain === undefined) return;
    expect(declinationsOf(plain)).toEqual([plain]);
  });

  test('l’identifiant du cadre de base : trois parties, la quatrième est le style', () => {
    expect(baseIdOf('jovial.fete.duo')).toBe('jovial.fete.duo');
    expect(baseIdOf('jovial.fete.duo.relief')).toBe('jovial.fete.duo');
  });

  test('l’atelier résout une déclinaison par son identifiant, et garde la même instance', () => {
    if (styled === undefined) return;
    const studio = createFrameStudio({ fonts: undefined });
    const style = styled.styles?.[0];
    if (style === undefined) return;
    const found = studio.find(`${styled.id}.${style.id}`);
    expect(found?.id).toBe(`${styled.id}.${style.id}`);
    expect(found).toBe(studio.find(`${styled.id}.${style.id}`));
    expect(studio.find(`${styled.id}.inconnu`)).toBeNull();
  });

  test('réconcilier une déclinaison garde le style tant que le cadre sert, et retombe sur le cadre sinon', () => {
    if (styled === undefined) return;
    const style = styled.styles?.[0];
    if (style === undefined) return;
    const id = `${styled.id}.${style.id}`;
    expect(reconcileFrame(frames, id, styled.people[0])?.id).toBe(id);
    const elsewhere = Math.max(styled.people[1] + 1, 1);
    const moved = reconcileFrame(frames, id, elsewhere);
    expect(moved === null || !moved.id.endsWith(`.${style.id}`) || moved.bucket !== styled.bucket).toBe(true);
  });
});

describe('l’atelier et la portée', () => {
  test('sans portée, tout le catalogue (les autres surfaces ne changent pas)', () => {
    const studio = createFrameStudio({ fonts: undefined });
    expect(studio.moods(2)).toEqual(moodsFor(studio.frames, 2));
    expect(studio.moods(2, 'spotlight')).toEqual(spotlightMoods(studio.frames, 2, 'spotlight'));
    expect(studio.framesOf(2, 'jovial', 'spotlight').map((frame) => frame.motif)).toEqual(spotlightFrames(studio.frames, 2, 'jovial', 'spotlight').map((frame) => frame.motif));
  });

  test('l’étagère des ambiances installées ne retient que celles-ci, quelle que soit la portée', () => {
    const shelved = shelvedStudio(createFrameStudio({ fonts: undefined }), ['jovial']);
    expect(shelved.moods(2, 'spotlight')).toEqual(['jovial']);
    expect(shelved.framesOf(2, 'signature', 'spotlight')).toEqual([]);
    expect(shelved.framesOf(2, 'jovial', 'spotlight').length).toBeGreaterThan(0);
  });
});

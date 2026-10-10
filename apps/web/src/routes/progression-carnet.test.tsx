import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { gameBlockFixture } from '@/lib/api/game-fixture';
import type { PhotoEnv } from '@/lib/game-photo/env';
import { flameMoment, meeshMoment, rankMoment, startMoment, type PhotoMoment } from '@/lib/game-photo/moments';
import type { Notebook, NotebookEntry } from '@/lib/game-photo/notebook';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CarnetBody } from './progression-carnet';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/carnet' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 15)));
const by = (host: ParentNode, attribute: string) => host.querySelector<HTMLElement>(`[${attribute}]`);

const kept = (moment: PhotoMoment, createdAt: string): NotebookEntry => ({
  id: moment.id,
  momentId: moment.id,
  emblem: moment.emblem,
  kicker: moment.kicker,
  title: moment.title,
  status: 'kept',
  createdAt,
  expiresAt: null,
  mode: 'selfie',
  story: new File(['s'], 'story.png', { type: 'image/png' }),
  square: new File(['q'], 'profil.png', { type: 'image/png' }),
});

const pending = (moment: PhotoMoment, createdAt: string, expiresAt: string): NotebookEntry => ({
  id: moment.id,
  momentId: moment.id,
  emblem: moment.emblem,
  kicker: moment.kicker,
  title: moment.title,
  status: 'pending',
  createdAt,
  expiresAt,
});

function bench(entries: readonly NotebookEntry[] | 'broken', link: string | null = null) {
  const state = { entries: [...(entries === 'broken' ? [] : entries)], removed: [] as string[], shared: [] as File[], texts: [] as (string | undefined)[] };
  const notebook: Notebook = {
    defer: async () => true,
    keep: async () => true,
    list: async () => (entries === 'broken' ? [] : [...state.entries]),
    remove: async (id) => {
      state.removed.push(id);
      state.entries = state.entries.filter((e) => e.id !== id);
      return true;
    },
  };
  const env = {
    notebook,
    share: async (file: File, _title: string, text?: string) => (state.shared.push(file), state.texts.push(text), 'shared' as const),
    referral: async () => link,
    now: () => new Date('2026-10-05T10:00:00.000Z'),
    playOptions: { reducedMotion: false, haptics: false, schedule: (run: () => void) => (run(), () => undefined) },
  } as unknown as PhotoEnv;
  return { env, state };
}

/**
 * LE CARNET DE PROGRESSION (#9382) — « le chemin parcouru » : les photos
 * gardées, les moments en attente (« plus tard », sept jours). Local à
 * l'appareil : un carnet qui ne s'ouvre pas se lit « vide », jamais comme une
 * erreur qui ferait croire à une perte.
 */
describe('un carnet vide', () => {
  test('on dit comment le remplir', async () => {
    const { env } = bench([]);
    const host = await mount(<CarnetBody env={env} />);
    await settle();
    expect(host.textContent).toContain('Ton carnet est vide');
    expect(host.textContent).toContain('Mee et Meo');
  });

  test('un stockage qui refuse se lit vide, sans alerte', async () => {
    const { env } = bench('broken');
    const host = await mount(<CarnetBody env={env} />);
    await settle();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toContain('Ton carnet est vide');
  });

  test('pendant la lecture : occupé, pas un faux vide', async () => {
    const { env: base } = bench([]);
    const env = { ...base, notebook: { ...base.notebook, list: () => new Promise<readonly NotebookEntry[]>(() => undefined) } } as PhotoEnv;
    const host = await mount(<CarnetBody env={env} />);
    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(host.textContent).not.toContain('Ton carnet est vide');
  });
});

describe('les photos gardées', () => {
  const entries = [kept(startMoment(), '2026-09-01T10:00:00.000Z'), kept(rankMoment({ rank: 'voix', division: 2 }), '2026-10-01T10:00:00.000Z')];

  test('chacune dit son titre et sa date, la plus récente en tête', async () => {
    const { env } = bench(entries);
    const host = await mount(<CarnetBody env={env} />);
    await settle();
    const titles = Array.from(host.querySelectorAll('[data-carnet-entry]')).map((e) => e.getAttribute('data-carnet-entry'));
    expect(titles).toEqual(['start', 'rank:voix:2'].reverse());
    expect(host.textContent).toContain('1 octobre 2026');
    expect(host.textContent).toContain('Voix II');
  });

  test('l’aperçu est une vraie image, nommée', async () => {
    const { env } = bench(entries);
    const host = await mount(<CarnetBody env={env} />);
    await settle();
    expect(host.querySelector('img')?.getAttribute('alt')).toContain('Voix II');
  });

  test('« Partager » envoie la story de CETTE entrée', async () => {
    const { env, state } = bench(entries);
    const host = await mount(<CarnetBody env={env} />);
    await settle();
    await click(by(host, 'data-carnet-share'));
    await settle();
    expect(state.shared).toHaveLength(1);
    expect(state.shared[0]?.type).toBe('image/png');
  });

  test('« Partager » redit aussi le lien de parrainage en texte (#7742)', async () => {
    const { env, state } = bench(entries, 'https://meeshy.me/signup/affiliate/aff_abc');
    const host = await mount(<CarnetBody env={env} />);
    await settle();
    await click(by(host, 'data-carnet-share'));
    await settle();
    expect(state.texts).toEqual(['Rejoins-moi sur Meeshy : https://meeshy.me/signup/affiliate/aff_abc']);
  });

  test('sans lien, l’image part seule', async () => {
    const { env, state } = bench(entries, null);
    const host = await mount(<CarnetBody env={env} />);
    await settle();
    await click(by(host, 'data-carnet-share'));
    await settle();
    expect(state.shared).toHaveLength(1);
    expect(state.texts).toEqual([undefined]);
  });

  test('retirer demande une confirmation, puis retire', async () => {
    const { env, state } = bench(entries);
    const host = await mount(<CarnetBody env={env} />);
    await settle();
    await click(by(host, 'data-carnet-remove'));
    expect(state.removed).toEqual([]);
    expect(host.textContent).toContain('Confirmer le retrait');
    await click(by(host, 'data-carnet-remove'));
    await settle();
    expect(state.removed).toEqual(['rank:voix:2']);
    expect(host.querySelectorAll('[data-carnet-entry]')).toHaveLength(1);
  });
});

describe('les moments en attente', () => {
  const entries = [pending(flameMoment(7), '2026-10-03T10:00:00.000Z', '2026-10-10T10:00:00.000Z')];

  test('« en attente » avec l’échéance, et de quoi photographier maintenant', async () => {
    const { env } = bench(entries);
    const host = await mount(<CarnetBody env={env} />);
    await settle();
    expect(host.textContent).toContain('En attente jusqu’au 10 octobre 2026');
    expect(host.textContent).toContain('7 jours de Flamme');
    expect(by(host, 'data-carnet-take')).not.toBeNull();
  });

  test('« Photographier » rouvre la proposition du moment', async () => {
    const { env } = bench(entries);
    const host = await mount(<CarnetBody env={env} />);
    await settle();
    await click(by(host, 'data-carnet-take'));
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Photo : 7 jours de Flamme');
  });

  test('une entrée en attente n’a pas d’aperçu ni de partage : rien à partager', async () => {
    const { env } = bench(entries);
    const host = await mount(<CarnetBody env={env} />);
    await settle();
    expect(by(host, 'data-carnet-share')).toBeNull();
    expect(host.querySelector('img')).toBeNull();
  });
});

/**
 * LE RATTRAPAGE (#9961, #9962) — chaque étape déjà franchie sans photo se
 * photographie, DANS L'ORDRE : la première de chaque piste est ouverte, les
 * suivantes l'attendent. Les étapes se lisent dans le bloc du jeu déjà en
 * cache ; sans lui, la section se tait.
 */
describe('à rattraper', () => {
  const game = gameBlockFixture({ mintedLifetime: 21, flameRecord: 8, streak: 6 });
  const keptStart = kept(startMoment(), '2026-09-01T10:00:00.000Z');
  const keptFirst = kept(meeshMoment({ number: 1, edition: 'silver' }), '2026-09-02T10:00:00.000Z');
  const catchUp = (host: ParentNode) => Array.from(host.querySelectorAll('[data-carnet-catch-up]')).map((e) => e.getAttribute('data-carnet-catch-up'));

  test('sans bloc du jeu en cache : aucune section', async () => {
    const { env } = bench([keptStart]);
    const host = await mount(<CarnetBody env={env} />);
    await settle();
    expect(host.textContent).not.toContain('À rattraper');
    expect(catchUp(host)).toEqual([]);
  });

  test('les étapes franchies sans photo gardée, jamais celles déjà gardées', async () => {
    const { env } = bench([keptStart, keptFirst]);
    const host = await mount(<CarnetBody env={env} game={game} />);
    await settle();
    expect(host.textContent).toContain('À rattraper');
    const ids = catchUp(host);
    expect(ids).toContain('meesh:10');
    expect(ids).toContain('meesh:20');
    expect(ids).toContain('flame:7');
    expect(ids).not.toContain('start');
    expect(ids).not.toContain('meesh:1');
  });

  test('une étape ouverte se photographie : le même déroulé que les autres', async () => {
    const { env } = bench([keptStart, keptFirst]);
    const host = await mount(<CarnetBody env={env} game={game} />);
    await settle();
    await click(host.querySelector<HTMLElement>('[data-carnet-catch-up="meesh:10"] [data-carnet-catch-up-take]'));
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Photo : Meesh n° 10');
  });

  test('une étape fermée dit laquelle prendre d’abord, sans bouton, et le dit au lecteur d’écran', async () => {
    const { env } = bench([keptStart, keptFirst]);
    const host = await mount(<CarnetBody env={env} game={game} />);
    await settle();
    const locked = host.querySelector<HTMLElement>('[data-carnet-catch-up="meesh:20"]');
    expect(locked?.hasAttribute('data-carnet-catch-up-locked')).toBe(true);
    expect(locked?.textContent).toContain('Prends d’abord : Meesh n° 10');
    expect(locked?.querySelector('button')).toBeNull();
    expect(locked?.getAttribute('aria-label')).toBe('Meesh n° 20 — verrouillée. Prends d’abord : Meesh n° 10');
  });

  test('les étapes se rangent par piste, chacune sous son nom', async () => {
    const { env } = bench([keptStart, keptFirst]);
    const host = await mount(<CarnetBody env={env} game={game} />);
    await settle();
    const tracks = Array.from(host.querySelectorAll('[data-carnet-track]')).map((e) => e.getAttribute('data-carnet-track'));
    expect(tracks).toContain('meesh');
    expect(tracks).toContain('flame');
    expect(host.querySelector('[data-carnet-track="meesh"]')?.textContent).toContain('Meeshes');
    expect(host.querySelector('[data-carnet-track="meesh"] [data-carnet-catch-up="flame:7"]')).toBeNull();
  });

  test('un moment en attente qui est une étape ne paraît qu’une fois : dans le rattrapage', async () => {
    const { env } = bench([keptStart, keptFirst, pending(flameMoment(7), '2026-10-03T10:00:00.000Z', '2026-10-10T10:00:00.000Z')]);
    const host = await mount(<CarnetBody env={env} game={game} />);
    await settle();
    expect(host.querySelectorAll('[data-carnet-entry="flame:7"]')).toHaveLength(0);
    expect(catchUp(host).filter((id) => id === 'flame:7')).toHaveLength(1);
    expect(host.textContent).not.toContain('En attente');
  });

  test('un carnet à jour : aucune section', async () => {
    const { env } = bench([keptStart]);
    const host = await mount(<CarnetBody env={env} game={gameBlockFixture({ mintedLifetime: 0, glory: 0, levelRecord: 1, score: 0, flameRecord: 0, streak: 0, balance: 0 })} />);
    await settle();
    expect(host.textContent).not.toContain('À rattraper');
  });
});

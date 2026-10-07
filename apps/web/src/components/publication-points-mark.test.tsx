import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { FeedPost } from '@/lib/api/feed-pages';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { FeedPostCard } from './feed-post-card';
import type { RollEnv } from './game/use-rolling-number';
import { FEED_GLYPHS } from './glyphs-feed';
import { PostPointsMark } from './publication-points-mark';

/**
 * #9570 — UN POST DIT, TRÈS DISCRÈTEMENT, CE QU'IL A RAPPORTÉ AU LECTEUR.
 *
 * Dans la ligne de métadonnées de la carte et de la fiche, après la date :
 * « · +99 », précédé d'un très petit glyphe, à l'encre tertiaire et à la
 * taille de la date — ni capsule, ni couleur, ni flamme : plus discret que la
 * marque des conversations. Absent (ancien serveur, lecteur sans compte) ou
 * 0 ⇒ rien. Pas un bouton. Le lecteur d'écran entend la phrase entière.
 */

const NOW = new Date('2026-10-07T12:00:00.000Z');
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadInterfaceCatalog('fr'), loadInterfaceCatalog('en'), loadInterfaceCatalog('ar')]);
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const post = (overrides: Partial<FeedPost> = {}): FeedPost => ({
  id: 'p1',
  type: 'POST',
  createdAt: '2026-10-07T11:00:00.000Z',
  content: 'Bonjour',
  originalLanguage: 'fr',
  author: { id: 'u1', displayName: 'Léa' },
  ...overrides,
});

const modelOf = (overrides: Partial<FeedPost> = {}) => resolveFeedCardModel(post(overrides), { preferredLanguages: ['fr'], now: NOW });
const card = (overrides: Partial<FeedPost> = {}, isDetail = false) =>
  renderToStaticMarkup(<FeedPostCard model={modelOf(overrides)} isDetail={isDetail} />);
const markOf = (html: string): string | undefined =>
  html.match(/<span[^>]*data-post-points=[^>]*>[\s\S]*?<span class="sr-only">[^<]*<\/span><\/span>/)?.[0];

describe('le modèle de la carte', () => {
  test('porte viewerPoints quand le post a rapporté quelque chose', () => {
    expect(modelOf({ viewerPoints: 99 }).viewerPoints).toBe(99);
  });

  test('absent, nul, ou malformé ⇒ aucun viewerPoints au modèle', () => {
    expect(modelOf().viewerPoints).toBeUndefined();
    expect(modelOf({ viewerPoints: 0 }).viewerPoints).toBeUndefined();
    expect(modelOf({ viewerPoints: null }).viewerPoints).toBeUndefined();
    expect(modelOf({ viewerPoints: -4 }).viewerPoints).toBeUndefined();
  });

  test('une republication porte SA valeur, jamais celle de son original', () => {
    const model = modelOf({ viewerPoints: 3, repostOfId: 'orig', repostOf: { id: 'orig', content: 'x' } });
    expect(model.viewerPoints).toBe(3);
  });
});

describe('la carte du fil et la fiche', () => {
  test('« · +99 » après la date, un très petit glyphe de points, encre tertiaire, taille de la date', () => {
    const html = card({ viewerPoints: 99 });
    const mark = markOf(html);
    expect(mark).toBeDefined();
    expect(mark).toContain('>+99<');
    expect(mark).toContain('·');
    expect(mark).toContain(FEED_GLYPHS.sparkle.body.slice(0, 40));
    expect(mark).toContain('text-check');
    expect(mark).toContain('var(--color-ios-ink-3)');
    expect(html.indexOf('data-feed-post-open="heure"')).toBeLessThan(html.indexOf('data-post-points'));
  });

  test('ni capsule, ni couleur, ni flamme — et pas un bouton', () => {
    const mark = markOf(card({ viewerPoints: 99 })) ?? '';
    expect(mark).not.toContain('rounded');
    expect(mark).not.toContain('background');
    expect(mark).not.toContain('--streak-ink');
    expect(mark).not.toContain('flame');
    expect(mark).not.toMatch(/<(button|a)\b/);
    expect(mark).not.toContain('role=');
  });

  test('le lecteur d’écran entend la phrase entière, le texte visible lui est muet', () => {
    const mark = markOf(card({ viewerPoints: 99 })) ?? '';
    expect(mark).toContain('<span class="sr-only">Ce post t’a rapporté 99 points</span>');
    expect(mark).toMatch(/aria-hidden="true"[^>]*>[\s\S]*\+99/);
    expect(markOf(card({ viewerPoints: 1 }))).toContain('Ce post t’a rapporté 1 point<');
  });

  test('la fiche porte la même marque, après sa date', () => {
    const html = card({ viewerPoints: 12 }, true);
    expect(markOf(html)).toContain('>+12<');
  });

  test('absent (ancien serveur) ou 0 ⇒ aucune marque', () => {
    expect(card()).not.toContain('data-post-points');
    expect(card({ viewerPoints: 0 })).not.toContain('data-post-points');
    expect(card({}, true)).not.toContain('data-post-points');
  });

  test('un grand cumul s’abrège dans la langue du lecteur', () => {
    expect(renderToStaticMarkup(<PostPointsMark points={1_234} language="en" />)).toContain('>+1.2K<');
  });

  test('la phrase suit la langue d’interface', () => {
    expect(renderToStaticMarkup(<PostPointsMark points={99} language="en" />)).toContain('This post earned you 99 points');
    expect(renderToStaticMarkup(<PostPointsMark points={99} language="ar" />)).toContain('منحك هذا المنشور 99 نقاط');
  });
});

describe('le nombre roule vers sa nouvelle valeur', () => {
  const frames = (): RollEnv & { readonly flush: (timestamp: number) => void } => {
    const queue: ((timestamp: number) => void)[] = [];
    return {
      reducedMotion: () => false,
      raf: (callback) => queue.push(callback),
      cancelRaf: () => undefined,
      flush: (timestamp) => queue.splice(0).forEach((callback) => callback(timestamp)),
    };
  };

  test('à la première peinture la valeur est là ; une hausse défile, la phrase dit déjà la cible', async () => {
    const roll = frames();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<PostPointsMark points={10} language="fr" roll={roll} />));
    expect(host.textContent).toContain('+10');

    act(() => root.render(<PostPointsMark points={20} language="fr" roll={roll} />));
    expect(host.querySelector('.sr-only')?.textContent).toBe('Ce post t’a rapporté 20 points');
    act(() => roll.flush(0));
    act(() => roll.flush(200));
    const midway = Number((host.querySelector('[data-post-points-value]')?.textContent ?? '').replace('+', ''));
    expect(midway).toBeGreaterThan(10);
    expect(midway).toBeLessThan(20);
    act(() => roll.flush(2_000));
    expect(host.querySelector('[data-post-points-value]')?.textContent).toBe('+20');

    act(() => root.unmount());
    host.remove();
  });
});

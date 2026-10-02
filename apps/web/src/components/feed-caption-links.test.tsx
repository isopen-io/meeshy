import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { FeedPost } from '@/lib/api/feed-pages';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { FeedMediaMosaic } from './feed-media-mosaic';
import { FeedPostCard } from './feed-post-card';

/**
 * **LES LÉGENDES DE MÉDIA DU FIL OUVRENT LEURS ADRESSES PAR `/l/`** (#9074) —
 * la carte `{ url, token }` du POST couvre son corps ET chaque légende de
 * média (#9073) : elle voyage avec chaque légende, qu'elle soit propre au
 * média ou le corps servi à la place de la légende d'un média SEUL.
 */
beforeAll(() => ensureHappyDomRegistered({ url: 'http://localhost/' }));
afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const NOW = new Date('2026-10-02T12:00:00.000Z');
const TRACKED = [
  { url: 'https://exemple.org/plage', token: 'Plage1' },
  { url: 'https://exemple.org/corps', token: 'Corps2' },
] as const;

const media = (id: string, caption?: string) => ({
  id,
  fileUrl: `https://gate.meeshy.me/api/v1/attachments/file/${id}.jpg`,
  mimeType: 'image/jpeg',
  width: 1000,
  height: 1000,
  ...(caption === undefined ? {} : { caption, captionLanguage: 'fr' }),
});

const post = (partial: Partial<FeedPost>): FeedPost => ({
  id: 'p1',
  type: 'POST',
  createdAt: '2026-10-02T11:55:00.000Z',
  originalLanguage: 'fr',
  metadata: { trackingLinks: [...TRACKED] },
  ...partial,
});

const modelOf = (p: FeedPost) => resolveFeedCardModel(p, { preferredLanguages: ['fr'], now: NOW });

describe('le modèle de carte porte la carte du post', () => {
  test('sur la carte, et sur chaque média qui porte une légende', () => {
    const model = modelOf(post({ media: [media('a', 'Vue https://exemple.org/plage'), media('b')] }));
    expect(model.trackingLinks).toEqual([...TRACKED]);
    expect(model.media[0]?.trackingLinks).toEqual([...TRACKED]);
    expect(model.media[1]?.trackingLinks).toBeUndefined();
  });

  test('le corps servi en légende d’un média SEUL garde la carte', () => {
    const model = modelOf(post({ content: 'Lis https://exemple.org/corps', media: [media('a')] }));
    expect(model.media[0]?.captionOrigin).toBe('post');
    expect(model.media[0]?.trackingLinks).toEqual([...TRACKED]);
  });

  test('sans carte servie, rien ne voyage', () => {
    const model = modelOf(post({ metadata: null, media: [media('a', 'x')] }));
    expect(model.trackingLinks).toBeUndefined();
    expect(model.media[0]?.trackingLinks).toBeUndefined();
  });
});

describe('le carrousel rend sa légende par RichText', () => {
  test('une adresse de la carte passe par /l/, une autre reste directe', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard model={modelOf(post({ media: [media('a', 'https://exemple.org/plage et https://ailleurs.net/x')] }))} />,
    );
    const caption = html.slice(html.indexOf('data-feed-carousel-caption'));
    expect(caption).toContain('href="/l/Plage1"');
    expect(caption).toContain('>m+Plage1</a>');
    expect(caption).toContain('href="https://ailleurs.net/x"');
    expect(caption).toContain('data-claims-gesture');
  });

  test('le corps servi en légende d’un média seul ouvre ses adresses par /l/', () => {
    const html = renderToStaticMarkup(<FeedPostCard model={modelOf(post({ content: 'Lis https://exemple.org/corps', media: [media('a')] }))} />);
    expect(html).toContain('data-feed-carousel-caption="post"');
    expect(html).toContain('href="/l/Corps2"');
  });
});

describe('la mosaïque rend sa légende par RichText', () => {
  test('une adresse de la carte passe par /l/', () => {
    const model = modelOf(
      post({ media: [media('a', 'https://exemple.org/plage'), media('b'), media('c')], storyEffects: { layout: 'hero' } }),
    );
    const html = renderToStaticMarkup(<FeedMediaMosaic media={model.media} layout="hero" />);
    expect(html).toContain('data-feed-mosaic-caption');
    expect(html).toContain('href="/l/Plage1"');
  });
});

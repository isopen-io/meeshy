import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { FeedPostCard } from '@/components/feed-post-card';
import type { FeedPost } from '@/lib/api/feed-pages';
import type { SocialEvent } from '@/lib/api/social-events';
import type { SocialEventV2Input } from '@/lib/api/social-events-v2-types';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { createFakeIntersectionObservers } from '@/test-support/fake-intersection-observer';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { IMPRESSION_DWELL_MS, readingTelemetry } from './reading-telemetry';
import { visibleTargets } from './viewability';

/**
 * L'IMPRESSION DIT OÙ ET COMMENT ELLE A ÉTÉ VUE (#10501) — position, page
 * servie, source de classement, visibilité MRC ; la fin de l'apparition
 * envoie la visibilité finale, reliée à l'impression par son eventId.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const NOW = new Date('2026-09-13T12:00:00.000Z');
const POST: FeedPost = { id: '6512bd43d9caa6e02c990b0a', type: 'POST', createdAt: '2026-09-13T11:55:00.000Z', content: 'Bonjour', originalLanguage: 'fr' };
const cardModel = () => resolveFeedCardModel(POST, { preferredLanguages: ['fr'], now: NOW });

const fakes = createFakeIntersectionObservers();
let native: unknown;
let counted: SocialEvent[] = [];
let v2: SocialEventV2Input[] = [];
const originals = { record: readingTelemetry.record, recordV2: readingTelemetry.recordV2 };
let container: HTMLDivElement;
let root: Root | null = null;

const show = (ratio = 1) => act(() => fakes.emitAll(ratio));
const dwell = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, IMPRESSION_DWELL_MS + 50)); });

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

beforeEach(() => {
  fakes.reset();
  native = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = fakes.FakeIntersectionObserver;
  counted = [];
  v2 = [];
  readingTelemetry.record = (event) => void counted.push(event);
  readingTelemetry.recordV2 = (event) => void v2.push(event);
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container.remove();
  readingTelemetry.record = originals.record;
  readingTelemetry.recordV2 = originals.recordV2;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = native;
});

const mount = (node: React.ReactNode) => {
  root = createRoot(container);
  act(() => root?.render(node));
};

const LISTING = { feedRequestId: 'fr-1', position: 3, rankingSource: 'following' as const };

describe('l’impression d’une carte de fil (#10501)', () => {
  test('porte sa position, la page servie, la source de classement, la visibilité et un eventId', async () => {
    mount(<FeedPostCard model={cardModel()} listing={LISTING} />);
    show(1);
    await dwell();
    const impression = counted.find((event) => event.type === 'impression');
    expect(impression).toMatchObject({ type: 'impression', postId: POST.id, source: 'feed', surface: 'feed', listing: LISTING });
    expect(impression?.eventId).toBeDefined();
    expect(impression?.type === 'impression' ? impression.visibility?.viewable : null).toBe(true);
  });

  test('la sortie de l’écran envoie `visibility/measured`, reliée à l’impression', async () => {
    mount(<FeedPostCard model={cardModel()} listing={LISTING} />);
    show(1);
    await dwell();
    show(0);
    const impression = counted.find((event) => event.type === 'impression');
    expect(v2).toHaveLength(1);
    expect(v2[0]).toMatchObject({
      type: 'visibility',
      action: 'measured',
      target: { kind: 'post', id: POST.id },
      surface: 'feed',
      listing: LISTING,
      impressionEventId: impression?.eventId,
      maxVisibleFraction: 1,
      viewable: true,
    });
  });

  test('une carte jamais restée une seconde n’envoie ni impression ni visibilité', () => {
    mount(<FeedPostCard model={cardModel()} />);
    show(1);
    show(0);
    expect(counted).toEqual([]);
    expect(v2).toEqual([]);
  });

  test('la carte à l’écran entre au registre que lit la détection de capture', () => {
    mount(<FeedPostCard model={cardModel()} />);
    show(0.75);
    expect(visibleTargets()).toContainEqual({ kind: 'post', id: POST.id, visibleFraction: 0.75 });
    act(() => root?.unmount());
    root = null;
    expect(visibleTargets().some((target) => target.id === POST.id)).toBe(false);
  });
});

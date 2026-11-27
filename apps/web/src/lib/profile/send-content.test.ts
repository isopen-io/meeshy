import { describe, expect, test } from 'bun:test';

import type { RelationLevel } from '@meeshy/shared/types/relation';
import { resolveProfileCircleView } from '@meeshy/shared/utils/profile-circle-view';

import type { FeedPost } from '@/lib/api/feed-pages';
import type { StoryTrayPost } from '@/lib/api/stories';
import { contentCardModelOf } from '@/lib/feed/content-card';

import { relationActionsOf, sendContentOffered } from './relation-face';
import {
  SEND_CONTENT_COLUMNS,
  SEND_CONTENT_KINDS,
  inlineVideoOf,
  planSendContent,
  sendContentCardRatio,
  sendContentChoices,
  sendContentListing,
  sendContentOutcomeOf,
  sendContentPagesFurther,
} from './send-content';

const itemsAt = (granted: RelationLevel) =>
  relationActionsOf(
    resolveProfileCircleView({
      viewerId: 'me',
      targetId: 'leo',
      grantedByViewer: granted,
      grantedByTarget: granted,
      sharesCommunity: false,
      blockedEitherWay: false,
      viewerMinor: 'adult',
      targetMinor: 'adult',
    }),
  );

const post = (overrides: Partial<FeedPost> & { readonly id: string }): FeedPost => ({
  type: 'POST',
  createdAt: '2026-11-20T10:00:00.000Z',
  author: { id: 'me', username: 'moi', displayName: 'Moi' },
  ...overrides,
});

const video = { id: 'v1', mimeType: 'video/mp4', fileUrl: '/u/clip.mp4', thumbnailUrl: '/u/clip.jpg', duration: 12_000 } as const;
const image = (id: string) => ({ id, mimeType: 'image/jpeg', fileUrl: `/u/${id}.jpg` });

const visualOf = (shown: FeedPost) =>
  contentCardModelOf(shown, { preferredLanguages: ['fr'], now: new Date('2026-11-21T10:00:00.000Z'), linkType: null, language: 'fr' }).visual;

const story = (overrides: Partial<StoryTrayPost> & { readonly id: string }): StoryTrayPost => ({
  type: 'STORY',
  createdAt: '2026-11-21T09:00:00.000Z',
  author: { id: 'me', username: 'moi' },
  media: [{ id: `${overrides.id}-m`, fileUrl: `/u/${overrides.id}.jpg`, mimeType: 'image/jpeg' }],
  ...overrides,
});

describe('« Lui envoyer un contenu » : la porte', () => {
  test('ouverte sur la fiche d un Proche, absente sous Proche', () => {
    expect(sendContentOffered(itemsAt('CLOSE'))).toBe(true);
    expect(sendContentOffered(itemsAt('BLOOD'))).toBe(true);
    expect(sendContentOffered(itemsAt('FRIEND'))).toBe(false);
    expect(sendContentOffered(itemsAt('PUBLIC'))).toBe(false);
  });

  test('sans verdict servi (passerelle plus ancienne, cache vide), rien ne s offre : fail-closed', () => {
    expect(sendContentOffered(null)).toBe(false);
  });
});

describe('« Lui envoyer un contenu » : les onglets', () => {
  const posts = [post({ id: 'p1' }), post({ id: 'r1', type: 'REEL', media: [video] }), post({ id: 'p2', content: 'texte seul' })];
  const stories = [story({ id: 's1' })];

  test('Publications, Réels, Stories, dans cet ordre', () => {
    expect(SEND_CONTENT_KINDS).toEqual(['publication', 'reel', 'story']);
  });

  test('Publications : tout ce qui n est pas un réel, texte seul compris ; Réels : les réels', () => {
    expect(sendContentChoices({ kind: 'publication', posts, stories }).map((shown) => shown.id)).toEqual(['p1', 'p2']);
    expect(sendContentChoices({ kind: 'reel', posts, stories }).map((shown) => shown.id)).toEqual(['r1']);
  });

  test('Publications : une humeur (STATUS) ne se propose pas, comme sur iOS ; le type se lit sans égard à la casse', () => {
    const served = [...posts, post({ id: 'm1', type: 'STATUS', content: '☕' }), post({ id: 'r2', type: 'reel', media: [video] })];
    expect(sendContentChoices({ kind: 'publication', posts: served, stories }).map((shown) => shown.id)).toEqual(['p1', 'p2']);
    expect(sendContentChoices({ kind: 'reel', posts: served, stories }).map((shown) => shown.id)).toEqual(['r1', 'r2']);
  });

  test('Stories : mes stories, devenues des contenus avec leurs médias', () => {
    const [only] = sendContentChoices({ kind: 'story', posts, stories });
    expect(only?.id).toBe('s1');
    expect(only?.type).toBe('STORY');
    expect(only?.media?.[0]?.fileUrl).toBe('/u/s1.jpg');
  });
});

describe('« Lui envoyer un contenu » : ce que la grille rend', () => {
  const at = (overrides: Partial<Parameters<typeof sendContentListing>[0]>) =>
    sendContentListing({ hasChoices: false, settled: true, loading: false, failed: false, hasMore: false, ...overrides });

  test('des cartes dès qu il y en a, même pendant une relecture (cache d abord)', () => {
    expect(at({ hasChoices: true, loading: true })).toBe('choices');
    expect(at({ hasChoices: true, failed: true })).toBe('choices');
  });

  test('jamais un vide avant la première lecture, ni tant qu une page reste à lire', () => {
    expect(at({ settled: false })).toBe('loading');
    expect(at({ loading: true })).toBe('loading');
    expect(at({ hasMore: true })).toBe('loading');
  });

  test('une erreur, et non un faux vide, quand la lecture a échoué sans rien servir', () => {
    expect(at({ failed: true, hasMore: true })).toBe('failed');
  });

  test('le vide se dit quand plus rien n est à lire', () => {
    expect(at({})).toBe('empty');
  });

  test('aucune carte de ce genre et une page de plus : la feuille la demande d elle-même, jamais après un échec', () => {
    const base = { hasChoices: false, settled: true, loading: false, failed: false, hasMore: true };
    expect(sendContentPagesFurther(base)).toBe(true);
    expect(sendContentPagesFurther({ ...base, failed: true })).toBe(false);
    expect(sendContentPagesFurther({ ...base, loading: true })).toBe(false);
    expect(sendContentPagesFurther({ ...base, hasChoices: true })).toBe(false);
  });

  test('trois cartes par ligne : une publication en 4:5, un réel et une story en portrait de scène', () => {
    expect(SEND_CONTENT_COLUMNS).toBe(3);
    expect(sendContentCardRatio('publication')).toBeCloseTo(4 / 5);
    expect(sendContentCardRatio('reel')).toBeCloseTo(9 / 16);
    expect(sendContentCardRatio('story')).toBeCloseTo(9 / 16);
  });
});

describe('« Lui envoyer un contenu » : ce qui se joue sur place', () => {
  test('une vidéo seule se joue, muette', () => {
    const clip = post({ id: 'r1', type: 'REEL', media: [video] });
    expect(inlineVideoOf(clip, visualOf(clip))?.id).toBe('v1');
  });

  test('un diaporama se fait glisser, il ne se joue pas ; une image ne se joue pas', () => {
    const slideshow = post({ id: 'p1', media: [video, image('i2')] });
    expect(inlineVideoOf(slideshow, visualOf(slideshow))).toBeNull();
    const photo = post({ id: 'p2', media: [image('i1')] });
    expect(inlineVideoOf(photo, visualOf(photo))).toBeNull();
  });
});

describe('« Lui envoyer un contenu » : l envoi', () => {
  const person = { id: 'leo', name: 'Léo' };

  test('part vers NOTRE conversation directe, ouverte (ou créée) d abord, avec l adresse du contenu', () => {
    const planned = planSendContent({ post: post({ id: 'p1', content: 'Coucher de soleil' }), person, viewerId: 'me' });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.entries).toHaveLength(1);
    const [entry] = planned.entries;
    expect(entry?.target).toEqual({ kind: 'contact', userId: 'leo', label: 'Léo' });
    expect(entry?.steps[0]).toEqual({ kind: 'open-direct', userId: 'leo' });
    expect(entry?.steps[1]).toEqual({ kind: 'text', text: 'https://meeshy.me/feeds/post/p1' });
    expect(planned.payload).toMatchObject({ kind: 'publication', postId: 'p1', postType: 'POST' });
  });

  test('un réel et une story gardent leur type', () => {
    const reel = planSendContent({ post: post({ id: 'r1', type: 'REEL', media: [video] }), person, viewerId: 'me' });
    expect(reel.ok && reel.payload.kind === 'publication' ? reel.payload.postType : null).toBe('REEL');
    const [mine] = sendContentChoices({ kind: 'story', posts: [], stories: [story({ id: 's1' })] });
    const sent = mine === undefined ? null : planSendContent({ post: mine, person, viewerId: 'me' });
    expect(sent?.ok && sent.payload.kind === 'publication' ? sent.payload.postType : null).toBe('STORY');
  });

  test('jamais vers soi-même', () => {
    const planned = planSendContent({ post: post({ id: 'p1' }), person: { id: 'me', name: 'Moi' }, viewerId: 'me' });
    expect(planned).toEqual({ ok: false, error: { kind: 'self-target' } });
  });
});

describe('« Lui envoyer un contenu » : ce que l envoi devient', () => {
  test('parti, en file hors ligne, ou refusé (conversation chiffrée de bout en bout comprise) ; rien tant qu il joue', () => {
    expect(sendContentOutcomeOf({ state: 'sent', conversationId: 'c1' })).toBe('sent');
    expect(sendContentOutcomeOf({ state: 'queued' })).toBe('offline');
    expect(sendContentOutcomeOf({ state: 'failed', failure: { kind: 'refused', status: 0, message: 'Conversation chiffrée de bout en bout' } })).toBe('refused');
    expect(sendContentOutcomeOf({ state: 'sending' })).toBeNull();
    expect(sendContentOutcomeOf({ state: 'idle' })).toBeNull();
    expect(sendContentOutcomeOf(undefined)).toBeNull();
  });
});

import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import type { FeedMedia, FeedPost } from '@/lib/api/feed-pages';

import { resolveFeedCardModel } from './card-model';
import { postImagingOf, type PostImagingInput } from './publication-imaging';

const NOW = new Date('2026-11-05T12:00:00Z');

const postOf = (overrides: Partial<FeedPost> = {}): FeedPost => ({
  id: 'p1',
  type: 'POST',
  createdAt: '2026-11-05T10:00:00Z',
  author: { id: 'u1', displayName: 'Awa Diallo', username: 'awa' },
  ...overrides,
});

const modelOf = (overrides: Partial<FeedPost> = {}, preferredLanguages: readonly string[] = ['fr']): PostImagingInput =>
  resolveFeedCardModel(postOf(overrides), { preferredLanguages, now: NOW });

const photo = (id: string, extra: Partial<FeedMedia> = {}): FeedMedia => ({ id, fileUrl: `https://cdn.meeshy.me/${id}.jpg`, mimeType: 'image/jpeg', width: 1080, height: 1350, ...extra });

const SCENE = { v: 3, scenes: [{ id: 's1', objects: [] }] };

describe('postImagingOf — ce qu’« Imager » fait d’un post ou d’un réel (#16166)', () => {
  test('un texte seul s’image en carte, l’auteur en signature', () => {
    const imaging = postImagingOf(modelOf({ content: 'Bonjour le monde' }));
    expect(imaging.kind).toBe('card');
    if (imaging.kind !== 'card') return;
    expect(imaging.subject.reply).toEqual({ author: 'Awa Diallo', text: 'Bonjour le monde', handle: 'awa' });
    expect(imaging.subject.quoted).toBeNull();
    expect(imaging.subject.media).toEqual([]);
    expect(imaging.subject.sentAt.toISOString()).toBe('2026-11-05T10:00:00.000Z');
    expect(imaging.scene).toBeNull();
  });

  test('une photo seule, sans texte, s’image avec sa photo signée par l’auteur', () => {
    const imaging = postImagingOf(modelOf({ media: [photo('m1')] }));
    expect(imaging.kind).toBe('card');
    if (imaging.kind !== 'card') return;
    expect(imaging.subject.reply.text).toBe('');
    expect(imaging.subject.media.map((item) => [item.id, item.card.kind, item.author?.name])).toEqual([['m1', 'image', 'Awa Diallo']]);
  });

  test('plusieurs photos partent toutes, dans leur ordre', () => {
    const imaging = postImagingOf(modelOf({ content: 'Album', media: [photo('m2', { order: 1 }), photo('m1', { order: 0 }), photo('m3', { order: 2 })] }));
    expect(imaging.kind === 'card' ? imaging.subject.media.map((item) => item.id) : []).toEqual(['m1', 'm2', 'm3']);
  });

  test('une vidéo s’image par sa première image', () => {
    const imaging = postImagingOf(modelOf({ type: 'REEL', media: [{ id: 'v1', fileUrl: 'https://cdn.meeshy.me/v1.mp4', mimeType: 'video/mp4', thumbnailUrl: 'https://cdn.meeshy.me/v1.jpg', width: 1080, height: 1920, duration: 12000 }] }));
    expect(imaging.kind).toBe('card');
    if (imaging.kind !== 'card') return;
    const [video] = imaging.subject.media;
    expect(video?.card.kind).toBe('video');
    expect(video?.posterUrl).toBe('https://cdn.meeshy.me/v1.jpg');
  });

  test('un vocal s’image par sa représentation', () => {
    const imaging = postImagingOf(modelOf({ media: [{ id: 'a1', fileUrl: 'https://cdn.meeshy.me/a1.m4a', mimeType: 'audio/mp4', duration: 8000 }] }));
    expect(imaging.kind).toBe('card');
    if (imaging.kind !== 'card') return;
    expect(imaging.subject.media.map((item) => [item.card.kind, item.card.kind === 'audio' ? item.card.durationMs : null])).toEqual([['audio', 8000]]);
  });

  test('un document seul n’a rien à peindre : rien ne s’image', () => {
    expect(postImagingOf(modelOf({ media: [{ id: 'd1', fileUrl: 'https://cdn.meeshy.me/d1.pdf', mimeType: 'application/pdf' }] })).kind).toBe('hidden');
  });

  test('un post vide ne s’image pas', () => {
    expect(postImagingOf(modelOf({})).kind).toBe('hidden');
  });

  test('une œuvre composée va aussi à l’atelier de carte, sa scène en média à rendre', () => {
    const model = modelOf({ type: 'REEL', content: 'Mon réel', storyEffects: SCENE, media: [photo('m1')] });
    const imaging = postImagingOf(model);
    expect(imaging.kind).toBe('card');
    if (imaging.kind !== 'card') return;
    expect(imaging.scene).toBe(model.scene ?? null);
    expect(imaging.subject.media).toEqual([]);
    expect(imaging.subject.reply.text).toBe('Mon réel');
  });

  describe('protégé — la loi de sortie ferme, comme pour un message (#9573)', () => {
    const base = modelOf({ content: 'Secret', media: [photo('m1')] });
    test('un contenu qui disparaît ne s’image pas', () => {
      expect(postImagingOf({ ...base, protection: { effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 60 } }).kind).toBe('hidden');
    });
    test('une vue unique ne s’image pas', () => {
      expect(postImagingOf({ ...base, protection: { isViewOnce: true } }).kind).toBe('hidden');
      expect(postImagingOf({ ...base, media: base.media.map((item) => ({ ...item, isViewOnce: true })) }).kind).toBe('hidden');
    });
    test('un contenu flouté ne s’image pas', () => {
      expect(postImagingOf({ ...base, protection: { isBlurred: true } }).kind).toBe('hidden');
      expect(postImagingOf({ ...base, media: base.media.map((item) => ({ ...item, effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED })) }).kind).toBe('hidden');
    });
    test('un contenu chiffré ne s’image pas', () => {
      expect(postImagingOf({ ...base, protection: { isEncrypted: true } }).kind).toBe('hidden');
    });
    test('une œuvre composée protégée ne s’image pas non plus', () => {
      const scene = modelOf({ content: 'x', storyEffects: SCENE });
      expect(postImagingOf({ ...scene, protection: { isViewOnce: true } }).kind).toBe('hidden');
    });
  });

  test('TÉMOIN DE RANG — un post dont la langue d’origine n’est pas au rang 1 s’image dans la langue SERVIE', () => {
    const model = modelOf(
      { content: 'Good morning everyone', originalLanguage: 'en', translations: { fr: { text: 'Bonjour à tous' } } },
      ['fr', 'en'],
    );
    const imaging = postImagingOf(model);
    expect(imaging.kind === 'card' ? imaging.subject.reply.text : null).toBe('Bonjour à tous');
  });

  test('TÉMOIN DE RANG 2 — sans traduction au rang 1, la traduction du rang 2, jamais translations[0]', () => {
    const model = modelOf(
      { content: 'Buenos días', originalLanguage: 'es', translations: { de: { text: 'Guten Morgen' }, en: { text: 'Good morning' } } },
      ['fr', 'en'],
    );
    const imaging = postImagingOf(model);
    expect(imaging.kind === 'card' ? imaging.subject.reply.text : null).toBe('Good morning');
  });
});

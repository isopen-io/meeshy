/**
 * Unit tests for posts route types and schemas (types.ts)
 * Tests encodeCursor, decodeCursor, CreatePostSchema, UpdatePostSchema,
 * StoryEffectsSchema, CreateCommentSchema.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  encodeCursor,
  decodeCursor,
  CreatePostSchema,
  UpdatePostSchema,
  StoryEffectsSchema,
  CreateCommentSchema,
  TranslatePostSchema,
} from '../../../../routes/posts/types';
import { MAX_POST_MEDIA } from '@meeshy/shared/types/attachment';

// ─── encodeCursor ─────────────────────────────────────────────────────────────

describe('encodeCursor', () => {
  it('encodes a Date and id into a base64url string', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    const result = encodeCursor(date, 'abc123');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('encodes a string date and id into a base64url string', () => {
    const result = encodeCursor('2024-01-01T00:00:00.000Z', 'abc123');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('produces output that decodeCursor can round-trip', () => {
    const date = new Date('2024-06-15T12:00:00.000Z');
    const id = '507f1f77bcf86cd799439011';
    const encoded = encodeCursor(date, id);
    const decoded = decodeCursor(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded?.id).toBe(id);
    expect(decoded?.createdAt).toBe(date.toISOString());
  });

  it('encodes different dates to different cursors', () => {
    const c1 = encodeCursor(new Date('2024-01-01'), 'id-1');
    const c2 = encodeCursor(new Date('2024-06-01'), 'id-2');
    expect(c1).not.toBe(c2);
  });
});

// ─── decodeCursor ─────────────────────────────────────────────────────────────

describe('decodeCursor', () => {
  it('returns null for invalid base64url input (garbage bytes)', () => {
    const result = decodeCursor('this is not valid base64url!!!');
    expect(result).toBeNull();
  });

  it('returns null for valid base64url that decodes to missing id field', () => {
    const missingId = Buffer.from(JSON.stringify({ createdAt: '2024-01-01' })).toString('base64url');
    const result = decodeCursor(missingId);
    expect(result).toBeNull();
  });

  it('returns null for valid base64url that decodes to missing createdAt field', () => {
    const missingDate = Buffer.from(JSON.stringify({ id: 'abc' })).toString('base64url');
    const result = decodeCursor(missingDate);
    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    const result = decodeCursor('');
    expect(result).toBeNull();
  });

  it('returns null for base64url of empty JSON object', () => {
    const emptyObj = Buffer.from(JSON.stringify({})).toString('base64url');
    const result = decodeCursor(emptyObj);
    expect(result).toBeNull();
  });

  it('returns the decoded data when cursor is valid', () => {
    const cursor = encodeCursor('2024-03-20T08:00:00.000Z', 'test-id-123');
    const result = decodeCursor(cursor);
    expect(result).toEqual({ createdAt: '2024-03-20T08:00:00.000Z', id: 'test-id-123' });
  });
});

// ─── CreatePostSchema ─────────────────────────────────────────────────────────

describe('CreatePostSchema', () => {
  it('parses a valid POST payload', () => {
    const result = CreatePostSchema.safeParse({ type: 'POST', content: 'Hello world', visibility: 'PUBLIC' });
    expect(result.success).toBe(true);
  });

  it('rejects EXCEPT visibility without visibilityUserIds', () => {
    const result = CreatePostSchema.safeParse({ type: 'POST', visibility: 'EXCEPT' });
    expect(result.success).toBe(false);
  });

  // `content` present depuis que le schema exige un porteur de contenu : ce
  // test porte sur la regle de VISIBILITE, pas sur la vacuite du post.
  it('accepts EXCEPT visibility with non-empty visibilityUserIds', () => {
    const result = CreatePostSchema.safeParse({
      type: 'POST',
      content: 'Hello',
      visibility: 'EXCEPT',
      visibilityUserIds: ['user-001'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects ONLY visibility without visibilityUserIds', () => {
    const result = CreatePostSchema.safeParse({ type: 'POST', visibility: 'ONLY' });
    expect(result.success).toBe(false);
  });

  it('accepts ONLY visibility with non-empty visibilityUserIds', () => {
    const result = CreatePostSchema.safeParse({
      type: 'POST',
      content: 'Hello',
      visibility: 'ONLY',
      visibilityUserIds: ['user-001'],
    });
    expect(result.success).toBe(true);
  });

  it('defaults type to POST when not specified', () => {
    const result = CreatePostSchema.safeParse({ content: 'Hello' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.type).toBe('POST');
  });

  it('accepts STORY type', () => {
    const result = CreatePostSchema.safeParse({ type: 'STORY', content: 'My story' });
    expect(result.success).toBe(true);
  });

  // Le payload porte un moodEmoji : depuis que le schéma exige au moins un
  // porteur de contenu, un `{ type: 'STATUS' }` nu est rejeté. Ce test vérifie
  // que STATUS est un type accepté — pas qu'un statut vide soit légitime.
  it('accepts STATUS type', () => {
    const result = CreatePostSchema.safeParse({ type: 'STATUS', moodEmoji: '😀' });
    expect(result.success).toBe(true);
  });

  it('accepts EXCEPT visibility with empty visibilityUserIds array (fails refine)', () => {
    const result = CreatePostSchema.safeParse({ type: 'POST', visibility: 'EXCEPT', visibilityUserIds: [] });
    expect(result.success).toBe(false);
  });

  // ── Aucun porteur de contenu ────────────────────────────────────────────
  //
  // Constaté le 2026-07-26 en production : huit stories d'un même auteur avec
  // `media: []`, `storyEffects: {"textObjects": []}` et `content: null`. Le
  // lecteur iOS les rendait en écran NOIR pendant toute la durée de slide.
  // Le schéma déclarait TOUS les porteurs optionnels sans jamais exiger qu'au
  // moins un soit présent : `POST /posts { type: 'STORY' }` créait un objet
  // vide, définitivement.

  it('rejects a story with no content carrier at all', () => {
    const result = CreatePostSchema.safeParse({ type: 'STORY' });
    expect(result.success).toBe(false);
  });

  it('rejects a story whose storyEffects carry nothing renderable', () => {
    const result = CreatePostSchema.safeParse({ type: 'STORY', storyEffects: { textObjects: [] } });
    expect(result.success).toBe(false);
  });

  it('rejects a post whose content is only whitespace', () => {
    const result = CreatePostSchema.safeParse({ type: 'POST', content: '   \n ' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty mediaIds array as the sole carrier', () => {
    const result = CreatePostSchema.safeParse({ type: 'POST', mediaIds: [] });
    expect(result.success).toBe(false);
  });

  // Le garde doit être PERMISSIF : un seul porteur suffit. Un faux rejet
  // empêcherait la publication de contenu légitime — bien pire qu'un objet
  // vide de plus en base.
  it.each([
    ['content', { content: 'Bonjour' }],
    ['mediaIds', { mediaIds: ['media-1'] }],
    ['audioUrl', { audioUrl: 'https://example.com/voice.m4a' }],
    ['moodEmoji', { moodEmoji: '🔥' }],
    ['repostOfId', { repostOfId: 'post-1' }],
    ['un texte sur le canvas', { storyEffects: { textObjects: [{ id: 't', text: 'Salut', x: 0.5, y: 0.5 }] } }],
    ['un fond de couleur seul', { storyEffects: { textObjects: [], background: '#6366F1' } }],
  ])('accepts a story carried by %s alone', (_label, payload) => {
    const result = CreatePostSchema.safeParse({ type: 'STORY', ...payload });
    expect(result.success).toBe(true);
  });

  it('accepts mediaAlt as a map of media id to alt text', () => {
    const result = CreatePostSchema.safeParse({
      type: 'POST',
      mediaIds: ['media-1'],
      mediaAlt: { 'media-1': 'A cat on a windowsill' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a mediaAlt value beyond 1000 characters', () => {
    const result = CreatePostSchema.safeParse({
      type: 'POST',
      mediaIds: ['media-1'],
      mediaAlt: { 'media-1': 'x'.repeat(1001) },
    });
    expect(result.success).toBe(false);
  });

  it('accepts exactly MAX_POST_MEDIA media ids — the bound is read from @meeshy/shared, not a literal', () => {
    const mediaIds = Array.from({ length: MAX_POST_MEDIA }, (_, i) => `media-${i}`);
    const result = CreatePostSchema.safeParse({ type: 'POST', mediaIds });
    expect(result.success).toBe(true);
  });

  it('rejects MAX_POST_MEDIA + 1 media ids', () => {
    const mediaIds = Array.from({ length: MAX_POST_MEDIA + 1 }, (_, i) => `media-${i}`);
    const result = CreatePostSchema.safeParse({ type: 'POST', mediaIds });
    expect(result.success).toBe(false);
  });
});

// ─── UpdatePostSchema ─────────────────────────────────────────────────────────

describe('UpdatePostSchema', () => {
  it('parses a valid update payload with content', () => {
    const result = UpdatePostSchema.safeParse({ content: 'Updated content' });
    expect(result.success).toBe(true);
  });

  it('rejects EXCEPT visibility without visibilityUserIds', () => {
    const result = UpdatePostSchema.safeParse({ visibility: 'EXCEPT' });
    expect(result.success).toBe(false);
  });

  it('rejects ONLY visibility without visibilityUserIds', () => {
    const result = UpdatePostSchema.safeParse({ visibility: 'ONLY' });
    expect(result.success).toBe(false);
  });

  it('accepts empty update (all fields optional)', () => {
    const result = UpdatePostSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts EXCEPT visibility with non-empty visibilityUserIds', () => {
    const result = UpdatePostSchema.safeParse({ visibility: 'EXCEPT', visibilityUserIds: ['user-1'] });
    expect(result.success).toBe(true);
  });

  it('accepts ONLY visibility with non-empty visibilityUserIds', () => {
    const result = UpdatePostSchema.safeParse({ visibility: 'ONLY', visibilityUserIds: ['user-1'] });
    expect(result.success).toBe(true);
  });

  it('accepts type change to REEL', () => {
    const result = UpdatePostSchema.safeParse({ type: 'REEL' });
    expect(result.success).toBe(true);
  });

  // L'édition de story rattache des médias fraîchement uploadés — même
  // contrat que CreatePostSchema (borné à 10).
  it('accepts mediaIds to attach newly uploaded media', () => {
    const result = UpdatePostSchema.safeParse({ mediaIds: ['media-1', 'media-2'] });
    expect(result.success).toBe(true);
  });

  it('rejects mediaIds beyond 10 entries', () => {
    const mediaIds = Array.from({ length: 11 }, (_, i) => `media-${i}`);
    const result = UpdatePostSchema.safeParse({ mediaIds });
    expect(result.success).toBe(false);
  });

  it('accepts exactly MAX_POST_MEDIA media ids — same shared bound as CreatePostSchema', () => {
    const mediaIds = Array.from({ length: MAX_POST_MEDIA }, (_, i) => `media-${i}`);
    const result = UpdatePostSchema.safeParse({ mediaIds });
    expect(result.success).toBe(true);
  });

  it('rejects MAX_POST_MEDIA + 1 media ids', () => {
    const mediaIds = Array.from({ length: MAX_POST_MEDIA + 1 }, (_, i) => `media-${i}`);
    const result = UpdatePostSchema.safeParse({ mediaIds });
    expect(result.success).toBe(false);
  });

  it('accepts mediaAlt alongside newly attached mediaIds', () => {
    const result = UpdatePostSchema.safeParse({
      mediaIds: ['media-1'],
      mediaAlt: { 'media-1': 'A sunset over the bay' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a mediaAlt value beyond 1000 characters', () => {
    const result = UpdatePostSchema.safeParse({ mediaAlt: { 'media-1': 'x'.repeat(1001) } });
    expect(result.success).toBe(false);
  });
});

// ─── StoryEffectsSchema ───────────────────────────────────────────────────────

describe('StoryEffectsSchema', () => {
  it('parses valid story effects with known fields', () => {
    const result = StoryEffectsSchema.safeParse({
      background: '#ff0000',
      thumbHash: 'abc123',
      slideDuration: 5,
    });
    expect(result.success).toBe(true);
  });

  it('rejects story effects exceeding 256KB total JSON size', () => {
    const bigString = 'a'.repeat(256 * 1024 + 1);
    const result = StoryEffectsSchema.safeParse({ background: bigString });
    expect(result.success).toBe(false);
  });

  it('rejects mediaObjects array exceeding 32 entries', () => {
    const mediaObjects = Array.from({ length: 33 }, (_, i) => ({ id: `media-${i}` }));
    const result = StoryEffectsSchema.safeParse({ mediaObjects });
    expect(result.success).toBe(false);
  });

  it('accepts mediaObjects array at max cap (32 entries)', () => {
    const mediaObjects = Array.from({ length: 32 }, (_, i) => ({ id: `media-${i}` }));
    const result = StoryEffectsSchema.safeParse({ mediaObjects });
    expect(result.success).toBe(true);
  });

  it('parses empty story effects object', () => {
    const result = StoryEffectsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('passes through unknown fields (passthrough policy)', () => {
    const result = StoryEffectsSchema.safeParse({ unknownField: 'value', background: '#000' });
    expect(result.success).toBe(true);
  });

  // A5 — ce qui est PERSISTÉ est le blob validé, pas une projection du schéma :
  // un canvas v3 traverse la validation d'écriture sans qu'aucune clé additive
  // (thumbHash de scène, variants du son, clés vivantes de payload) ne tombe.
  it('a canvas v3 document survives the write validation KEY FOR KEY', () => {
    const doc = {
      v: 3,
      scenes: [{
        id: 's1',
        thumbHash: '1QcSHQRnh493V4dIh4eXh0h4kJUI',
        objects: [{
          id: 'a1', kind: 'audio',
          anchor: { t: 'free', x: 0.5, y: 0.82 },
          plane: 'content', z: 6,
          transform: { scale: 1, rotation: 0, opacity: 1 },
          payload: { soundId: '64b0000000000000000000dd', soundAuthorUsername: 'sam', volume: 0.35 },
        }],
      }],
      sound: {
        source: { t: 'library', soundId: 'snd_forest_rain' },
        volume: 0.45,
        variants: [{ postMediaId: '64b0000000000000000000e1', language: 'fr', isAutoGenerated: true }],
      },
    };
    const result = StoryEffectsSchema.safeParse(doc);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(doc);
  });
});

// ─── CreateCommentSchema ──────────────────────────────────────────────────────

describe('CreateCommentSchema', () => {
  it('parses a valid comment with text content', () => {
    const result = CreateCommentSchema.safeParse({ content: 'Hello world' });
    expect(result.success).toBe(true);
  });

  it('parses a valid comment with attachment only (no text)', () => {
    const result = CreateCommentSchema.safeParse({ attachmentIds: ['media-001'] });
    expect(result.success).toBe(true);
  });

  it('rejects a comment with neither content nor attachment', () => {
    const result = CreateCommentSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects a comment with empty content and no attachment', () => {
    const result = CreateCommentSchema.safeParse({ content: '   ' });
    expect(result.success).toBe(false);
  });

  it('accepts a comment with both content and attachment', () => {
    const result = CreateCommentSchema.safeParse({ content: 'Great!', attachmentIds: ['media-001'] });
    expect(result.success).toBe(true);
  });

  it('rejects attachmentIds with more than 1 entry', () => {
    const result = CreateCommentSchema.safeParse({ attachmentIds: ['media-001', 'media-002'] });
    expect(result.success).toBe(false);
  });
});

// ─── TranslatePostSchema ──────────────────────────────────────────────────────
//
// Le bouton « Retraduire » de la feuille des langues du lecteur rejoue une
// langue DÉJÀ traduite. Sans un drapeau explicite, il appelait la même route
// que « Traduire » et sortait aussitôt sur les gardes de cache : le bouton ne
// faisait rien, sans le moindre signal à l'utilisateur.

describe('TranslatePostSchema', () => {
  it('accepte une simple langue cible', () => {
    const result = TranslatePostSchema.safeParse({ targetLanguage: 'fr' });
    expect(result.success).toBe(true);
  });

  it('accepte le forçage explicite', () => {
    const result = TranslatePostSchema.safeParse({ targetLanguage: 'fr', force: true });
    expect(result.success).toBe(true);
    expect(result.success && result.data.force).toBe(true);
  });

  it('ne force rien par défaut', () => {
    const result = TranslatePostSchema.safeParse({ targetLanguage: 'fr' });
    expect(result.success && result.data.force).toBeUndefined();
  });

  it('refuse un forçage non booléen', () => {
    const result = TranslatePostSchema.safeParse({ targetLanguage: 'fr', force: 'oui' });
    expect(result.success).toBe(false);
  });

  it('refuse une langue cible absente', () => {
    expect(TranslatePostSchema.safeParse({ force: true }).success).toBe(false);
  });
});

// ─── StoryEffectsSchema — plafond de volume ───────────────────────────────────

describe('StoryEffectsSchema — plafond de volume', () => {
  it('accepte un volume de 2 sur un audioPlayerObject', () => {
    const result = StoryEffectsSchema.safeParse({
      audioPlayerObjects: [{ id: 'a1', postMediaId: 'm1', volume: 2 }],
    });
    expect(result.success).toBe(true);
  });

  it('accepte un volume de 2 sur un mediaObject', () => {
    const result = StoryEffectsSchema.safeParse({
      mediaObjects: [{ id: 'm1', postMediaId: 'p1', volume: 2 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejette un volume de 2.1', () => {
    const result = StoryEffectsSchema.safeParse({
      audioPlayerObjects: [{ id: 'a1', postMediaId: 'm1', volume: 2.1 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejette un volume négatif', () => {
    const result = StoryEffectsSchema.safeParse({
      audioPlayerObjects: [{ id: 'a1', postMediaId: 'm1', volume: -0.1 }],
    });
    expect(result.success).toBe(false);
  });
});

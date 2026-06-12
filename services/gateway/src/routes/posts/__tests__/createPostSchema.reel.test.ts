/**
 * CreatePostSchema / RepostSchema — type REEL (fondation 2026-06-12).
 *
 * Un reel est un post permanent média-first : la création sans média est
 * rejetée à la validation (un reel vide ne peut pas se rendre plein écran).
 *
 * @jest-environment node
 */
import { CreatePostSchema, RepostSchema } from '../types';

describe('CreatePostSchema — REEL', () => {
  it('accepte un REEL avec au moins un média', () => {
    const parsed = CreatePostSchema.safeParse({
      type: 'REEL',
      mediaIds: ['media-1'],
      content: 'Mon premier reel',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejette un REEL sans média', () => {
    const parsed = CreatePostSchema.safeParse({
      type: 'REEL',
      content: 'Reel sans média',
    });
    expect(parsed.success).toBe(false);
    expect(parsed.success ? '' : parsed.error.issues[0].message).toContain('REEL');
  });

  it('rejette un REEL avec mediaIds vide', () => {
    const parsed = CreatePostSchema.safeParse({
      type: 'REEL',
      mediaIds: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('ne contraint pas les autres types (POST sans média reste valide)', () => {
    const parsed = CreatePostSchema.safeParse({
      type: 'POST',
      content: 'Texte seul',
    });
    expect(parsed.success).toBe(true);
  });
});

describe('RepostSchema — REEL', () => {
  it('accepte targetType REEL', () => {
    const parsed = RepostSchema.safeParse({ targetType: 'REEL' });
    expect(parsed.success).toBe(true);
  });
});

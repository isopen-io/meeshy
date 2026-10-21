import { describe, expect, it } from 'vitest';
import {
  ADMIN_POST_BATCH_MAX,
  adminGesturesFor,
  adminPostBatchGestureSchema,
  adminPostGestureSchema,
  adminPostModerationViewSchema,
  adminPostStateOf,
  adminReportActSchema,
} from '../admin-publications';

const id = (n: number) => `68a0000000000000000000${String(n).padStart(2, '0')}`;
const now = new Date('2026-10-12T12:00:00.000Z');
const facts = (overrides: Partial<Parameters<typeof adminPostStateOf>[0]> = {}) => ({
  visibility: 'PUBLIC',
  deletedAt: null,
  expiresAt: null,
  moderationHiddenAt: null,
  ...overrides,
});

describe('adminPostGestureSchema', () => {
  it('accepte les trois gestes, set-visibility avec une audience posable', () => {
    expect(adminPostGestureSchema.parse({ gesture: 'take-offline' })).toEqual({ gesture: 'take-offline' });
    expect(adminPostGestureSchema.parse({ gesture: 'restore', reason: '  spam  ' })).toEqual({ gesture: 'restore', reason: 'spam' });
    expect(adminPostGestureSchema.parse({ gesture: 'set-visibility', visibility: 'PUBLIC' })).toEqual({ gesture: 'set-visibility', visibility: 'PUBLIC' });
  });

  it("refuse EXCEPT et ONLY, qui exigent une liste que seul l'auteur choisit", () => {
    expect(adminPostGestureSchema.safeParse({ gesture: 'set-visibility', visibility: 'EXCEPT' }).success).toBe(false);
    expect(adminPostGestureSchema.safeParse({ gesture: 'set-visibility', visibility: 'ONLY' }).success).toBe(false);
    expect(adminPostGestureSchema.safeParse({ gesture: 'set-visibility' }).success).toBe(false);
  });

  it('refuse un geste inconnu et un motif de plus de 500 caractères', () => {
    expect(adminPostGestureSchema.safeParse({ gesture: 'delete' }).success).toBe(false);
    expect(adminPostGestureSchema.safeParse({ gesture: 'restore', reason: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('adminPostBatchGestureSchema', () => {
  it('porte de 1 à 50 identifiants ObjectId', () => {
    const ids = Array.from({ length: ADMIN_POST_BATCH_MAX }, (_, n) => id(n));
    expect(adminPostBatchGestureSchema.safeParse({ gesture: 'take-offline', postIds: ids }).success).toBe(true);
    expect(adminPostBatchGestureSchema.safeParse({ gesture: 'take-offline', postIds: [...ids, id(99)] }).success).toBe(false);
    expect(adminPostBatchGestureSchema.safeParse({ gesture: 'take-offline', postIds: [] }).success).toBe(false);
    expect(adminPostBatchGestureSchema.safeParse({ gesture: 'take-offline', postIds: ['nope'] }).success).toBe(false);
  });
});

describe('adminReportActSchema', () => {
  it('accepte les quatre actions et refuse les autres', () => {
    ['take-offline', 'make-private', 'remove-comment', 'dismiss'].forEach((action) => expect(adminReportActSchema.safeParse({ action }).success).toBe(true));
    expect(adminReportActSchema.safeParse({ action: 'ban' }).success).toBe(false);
  });
});

describe('adminPostModerationViewSchema', () => {
  it('décrit la vue rendue après un geste', () => {
    const view = { id: id(1), state: 'offline', visibility: 'PRIVATE', moderationHiddenAt: now.toISOString(), moderationPriorVisibility: 'PUBLIC', updatedAt: now.toISOString() };
    expect(adminPostModerationViewSchema.parse(view)).toEqual(view);
  });
});

describe('adminPostStateOf', () => {
  it('range par priorité : supprimée > hors ligne > expirée > privée > publiée', () => {
    const hidden = now.toISOString();
    expect(adminPostStateOf(facts({ deletedAt: hidden, moderationHiddenAt: hidden }), now)).toBe('deleted');
    expect(adminPostStateOf(facts({ moderationHiddenAt: hidden, visibility: 'PRIVATE', expiresAt: '2020-01-01T00:00:00Z' }), now)).toBe('offline');
    expect(adminPostStateOf(facts({ expiresAt: now, visibility: 'PRIVATE' }), now)).toBe('expired');
    expect(adminPostStateOf(facts({ visibility: 'PRIVATE' }), now)).toBe('private');
    expect(adminPostStateOf(facts({ expiresAt: 'illisible' }), now)).toBe('published');
    expect(adminPostStateOf(facts(), now)).toBe('published');
  });
});

describe('adminGesturesFor', () => {
  it("ne propose rien sur une supprimée, la remise en ligne (audience de l'auteur ou choisie) sur une hors ligne", () => {
    expect(adminGesturesFor('deleted')).toEqual([]);
    expect(adminGesturesFor('offline')).toEqual(['restore', 'set-visibility']);
    expect(adminGesturesFor('published')).toEqual(['take-offline', 'set-visibility']);
  });
});
